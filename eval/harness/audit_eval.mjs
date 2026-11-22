// Measures the app's real cloud check: the same prompt function the app uses (src/core/prompts.ts),
// masked ticket text, masked examples, and a bank that matches each size.
// Usage: node audit_eval.mjs <results.jsonl> [model=gemini-3.5-flash-lite] [sizes=20,60,120] [limit=80]
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { getGenerativeModel, InferenceMode, Schema } from 'firebase/ai';
import { makeAI, readJSON, DATA } from './nodeapp.mjs';
import { seededShuffle } from './src/common.js';
import { tokenize, buildIndex, topK, knnVote } from './src/retrieval.js';
import { buildAuditPrompt } from '../../src/core/prompts.ts';
import { mask } from '../../src/core/mask.ts';

const [OUT, MODEL = 'gemini-3.5-flash-lite', SIZES = '20,60,120', LIMIT = '80'] = process.argv.slice(2);
const teams = readJSON(DATA + 'teams.json');
const tickets = readJSON(DATA + 'tickets.json');
const ids = teams.map((t) => t.id);
const bankAll = seededShuffle(tickets.filter((t) => t.split === 'bank'), 42).map((t) => ({ ...t, text: mask(t.text).text }));
const holdout = tickets.filter((t) => t.split === 'holdout').slice(0, Number(LIMIT));
const mode = `audit:${MODEL}`;

const done = new Set();
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    try {
      const r = JSON.parse(line);
      if (r.stage === 'item' && !r.err) done.add(r.key);
    } catch {}
  }
}

const model = getGenerativeModel(makeAI(), {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: MODEL,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: Schema.object({
        properties: { team: Schema.enumString({ enum: ids }), reason: Schema.string() },
        propertyOrdering: ['team', 'reason'],
      }),
    },
  },
});

let lastCall = 0;
for (const n of SIZES.split(',').map(Number)) {
  const bank = bankAll.slice(0, n);
  const index = buildIndex(bank.map((b) => tokenize(b.text)));
  let right = 0, total = 0;
  for (const t of holdout) {
    const key = `${mode}|${n}|${t.id}`;
    if (done.has(key)) continue;
    const text = mask(t.text).text;
    const hits = topK(index, tokenize(text), Math.min(8, n));
    const examples = hits.map((h) => bank[h.i]).reverse();
    const prompt = buildAuditPrompt(teams, examples, text);
    // Free tier allows 15 requests a minute: keep at least 4.2 s between calls, and wait out a per-minute 429.
    let pred = null, reason = null, err = null, ms = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, Math.max(0, lastCall + 4200 - Date.now())));
      lastCall = Date.now();
      const t0 = Date.now();
      err = null;
      try {
        const res = await model.generateContent(prompt);
        ({ team: pred = null, reason = null } = JSON.parse(res.response.text()));
      } catch (e) {
        err = String(e);
      }
      ms = Date.now() - t0;
      const wait = err && /per minute|PerMinute/i.test(err) ? Number(/retry in ([\d.]+)s/.exec(err)?.[1] ?? 30) : 0;
      if (!wait) break;
      console.log(`  per-minute limit, waiting ${Math.ceil(wait)} s`);
      await new Promise((r) => setTimeout(r, wait * 1000 + 500));
    }
    total++;
    if (pred === t.team) right++;
    console.log(`${mode} n=${n} ${total} ${t.id} gold=${t.team} pred=${pred} acc=${((100 * right) / total).toFixed(0)}% ${ms}ms ${err ? err.slice(0, 160) : ''}`);
    appendFileSync(OUT, JSON.stringify({ stage: 'item', key, mode, n, id: t.id, gold: t.team, pred, reason, ms, err,
      knnPred: knnVote(hits.map((h) => ({ team: bank[h.i].team, score: h.score }))) }) + '\n');
    if (err && /quota|429|RESOURCE_EXHAUSTED/i.test(err) && /per ?day|PerDay/i.test(err)) {
      console.log('Daily quota reached; stopping.');
      process.exit(2);
    }
    if (err) await new Promise((r) => setTimeout(r, 5000));
  }
}
