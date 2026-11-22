// Cloud ceiling for the spike: same prompts as the browser run, sent with ONLY_IN_CLOUD from Node.
// Usage: node cloud.mjs <results.jsonl> [model=gemini-3.5-flash] [sizes=0,120] [limit=80] [k=8]
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema } from 'firebase/ai';
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';
import { tokenize, buildIndex, topK, knnVote } from './src/retrieval.js';
import { seededShuffle, buildPrompt } from './src/common.js';

const [OUT, MODEL = 'gemini-3.5-flash', SIZES = '0,120', LIMIT = '80', K = '8'] = process.argv.slice(2);
const here = new URL('.', import.meta.url).pathname;
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const teams = read(here + '../data/teams.json');
const tickets = read(here + '../data/tickets.json');
const ids = teams.map((t) => t.id);
const bankAll = seededShuffle(tickets.filter((t) => t.split === 'bank'), 42);
const holdout = tickets.filter((t) => t.split === 'holdout').slice(0, Number(LIMIT));
const mode = `cloud:${MODEL}`;

const done = new Set();
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    try {
      const r = JSON.parse(line);
      if (r.stage === 'item' && !r.err) done.add(r.key);
    } catch {}
  }
}

// App Check is enforced on AI Logic. Node has no attestation provider, so exchange the
// registered debug token (kept in a gitignored file) for an App Check token over REST.
const cfg = read(here + 'config.json');
const app = initializeApp(cfg);
const debugToken = readFileSync(here + '.appcheck-debug-token', 'utf8').trim();
initializeAppCheck(app, {
  isTokenAutoRefreshEnabled: false,
  provider: new CustomProvider({
    getToken: async () => {
      const url = `https://firebaseappcheck.googleapis.com/v1/projects/${cfg.projectId}/apps/${cfg.appId}:exchangeDebugToken?key=${cfg.apiKey}`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debugToken }) });
      if (!res.ok) throw new Error(`exchangeDebugToken ${res.status}`);
      const body = await res.json();
      return { token: body.token, expireTimeMillis: Date.now() + parseInt(body.ttl, 10) * 1000 };
    },
  }),
});
const ai = getAI(app, { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: MODEL,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: Schema.object({ properties: { team: Schema.enumString({ enum: ids }) } }),
    },
  },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const n of SIZES.split(',').map(Number)) {
  const bank = bankAll.slice(0, n);
  const index = n ? buildIndex(bank.map((b) => tokenize(b.text))) : null;
  let right = 0, total = 0;
  for (const t of holdout) {
    const key = `${mode}|${n}|${t.id}`;
    if (done.has(key)) continue;
    const hits = n ? topK(index, tokenize(t.text), Math.min(Number(K), n)) : [];
    const examples = hits.map((h) => bank[h.i]).reverse();
    const knnPred = n ? knnVote(hits.map((h) => ({ team: bank[h.i].team, score: h.score }))) : null;
    const prompt = buildPrompt(teams, examples, t.text);
    let pred = null, err = null, raw = null, usage = null, ms = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const t0 = Date.now();
      try {
        const res = await model.generateContent(prompt);
        raw = res.response.text();
        usage = res.response.usageMetadata ?? null;
        pred = JSON.parse(raw).team ?? null;
        err = null;
      } catch (e) {
        err = String(e).slice(0, 400);
      }
      ms = Date.now() - t0;
      if (err && /per day|PerDay/.test(err)) { console.log('daily quota exhausted, stopping'); process.exit(2); }
      if (!err || !/429|503|RESOURCE_EXHAUSTED|UNAVAILABLE/.test(err)) break;
      await sleep(5000 * 2 ** attempt);
    }
    total++;
    if (pred === t.team) right++;
    console.log(`${mode} n=${n} ${total}/${holdout.length} ${t.id} gold=${t.team} pred=${pred} acc=${(100 * right / total).toFixed(0)}% ${ms}ms ${err || ''}`);
    appendFileSync(OUT, JSON.stringify({
      run: `cloud-${MODEL}`, stage: 'item', key, mode, n, k: Number(K), id: t.id, gold: t.team, pred, knnPred,
      rule: t.rule, ambiguous: t.ambiguous, ms, err, raw, usage, promptChars: prompt.length,
      neighbours: hits.map((h) => bank[h.i].id),
    }) + '\n');
  }
}
