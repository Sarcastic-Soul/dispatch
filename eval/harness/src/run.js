// Day-1 spike: does retrieved few-shot help the on-device model route tickets?
// URL params:
//   mode=device|cloud   (device = ONLY_ON_DEVICE, cloud = ONLY_IN_CLOUD ceiling)
//   n=0,120,60,20       bank sizes to test, in run order
//   k=8                 examples retrieved per ticket
//   limit=80            holdout tickets per bank size
//   model=gemini-3.5-flash  cloud model name
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema } from 'firebase/ai';
import { tokenize, buildIndex, topK, knnVote } from './retrieval.js';
import { seededShuffle, buildPrompt } from './common.js';

const params = new URLSearchParams(location.search);
const MODE = params.get('mode') || 'device';
const SIZES = (params.get('n') || '0,120,60,20').split(',').map(Number);
const K = Number(params.get('k') || 8);
const LIMIT = Number(params.get('limit') || 80);
const CLOUD_MODEL = params.get('model') || 'gemini-3.5-flash';
const RULES = params.get('rules') || '';  // '' | 'gold' | 'learned'
const LABEL = params.get('label') || MODE + (RULES ? `+${RULES}-rules` : '') + (K !== 8 ? `-k${K}` : '');
const RUN = params.get('run') || `${LABEL}-${Date.now()}`;

const logEl = document.getElementById('log');
const statusEl = document.getElementById('status');
const log = (s) => { logEl.textContent = s + '\n' + logEl.textContent.slice(0, 20000); };
const post = (body) => fetch('/result', { method: 'POST', body: JSON.stringify({ run: RUN, ...body }) }).catch(() => {});

async function main() {
  const firebaseConfig = await fetch('/config.json').then((r) => r.json());
  const [teams, tickets] = await Promise.all([
    fetch('/data/teams.json').then((r) => r.json()),
    fetch('/data/tickets.json').then((r) => r.json()),
  ]);
  const ids = teams.map((t) => t.id);
  const bankAll = seededShuffle(tickets.filter((t) => t.split === 'bank'), 42);
  const holdout = tickets.filter((t) => t.split === 'holdout').slice(0, LIMIT);
  const goldRules = (await fetch('/data/rules.json').then((r) => r.json())).map((r) => ({ rule: r.text, team: r.team }));
  const done = new Set(await fetch(`/done?run=${encodeURIComponent(RUN)}`).then((r) => r.json()));

  const app = initializeApp(firebaseConfig);
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = MODE === 'device'
    ? getGenerativeModel(ai, {
        mode: InferenceMode.ONLY_ON_DEVICE,
        onDeviceParams: {
          createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] },
          promptOptions: {
            responseConstraint: { type: 'object', properties: { team: { type: 'string', enum: ids } }, required: ['team'] },
          },
        },
      })
    : getGenerativeModel(ai, {
        mode: InferenceMode.ONLY_IN_CLOUD,
        inCloudParams: {
          model: CLOUD_MODEL,
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: Schema.object({ properties: { team: Schema.enumString({ enum: ids }) } }),
          },
        },
      });

  await post({ stage: 'start', mode: LABEL, sizes: SIZES, k: K, limit: LIMIT, ua: navigator.userAgent });

  for (const n of SIZES) {
    const bank = bankAll.slice(0, n);
    const rules = RULES === 'gold' ? goldRules : RULES === 'learned' && n ? await fetch(`/data/learned_rules_${n}.json`).then((r) => r.json()) : [];
    const index = n ? buildIndex(bank.map((b) => tokenize(b.text))) : null;
    let right = 0, total = 0;
    for (const t of holdout) {
      const key = `${LABEL}|${n}|${t.id}`;
      if (done.has(key)) continue;
      const hits = n ? topK(index, tokenize(t.text), Math.min(8, n)) : [];
      const examples = hits.slice(0, K).map((h) => bank[h.i]).reverse(); // most similar last, nearest the new ticket
      const knnPred = n ? knnVote(hits.map((h) => ({ team: bank[h.i].team, score: h.score }))) : null;
      const prompt = buildPrompt(teams, examples, t.text, rules);
      const t0 = performance.now();
      let pred = null, err = null, raw = null;
      try {
        const res = await model.generateContent(prompt);
        raw = res.response.text();
        pred = JSON.parse(raw).team ?? null;
      } catch (e) {
        err = String(e);
      }
      const ms = Math.round(performance.now() - t0);
      total++;
      if (pred === t.team) right++;
      statusEl.textContent = `${LABEL} n=${n}: ${total}/${holdout.length}, acc so far ${(100 * right / total).toFixed(0)}%, last ${ms} ms`;
      log(`${t.id} n=${n} gold=${t.team} pred=${pred} knn=${knnPred} ${ms}ms ${err || ''}`);
      await post({
        stage: 'item', key, mode: LABEL, n, k: K, rulesCount: rules.length, id: t.id, gold: t.team, pred, knnPred,
        rule: t.rule, ambiguous: t.ambiguous, ms, err, raw, promptChars: prompt.length,
        neighbours: hits.map((h) => bank[h.i].id),
      });
    }
  }
  statusEl.textContent += ' — done';
  await post({ stage: 'final' });
}

main().catch(async (e) => {
  statusEl.textContent = 'Error: ' + e;
  await post({ stage: 'error', err: String(e), stack: e.stack });
  await post({ stage: 'final' });
});
