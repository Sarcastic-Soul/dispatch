// "Cloud teaches": Gemini reads the labelled bank and writes a short routing playbook
// that the on-device model gets in its prompt.
// Usage: node distill.mjs [model=gemini-3.5-flash] [sizes=20,60,120]
import { writeFileSync } from 'node:fs';
import { getGenerativeModel, InferenceMode, Schema } from 'firebase/ai';
import { makeAI, readJSON, DATA } from './nodeapp.mjs';
import { seededShuffle } from './src/common.js';

const [MODEL = 'gemini-3.5-flash', SIZES = '20,60,120'] = process.argv.slice(2);
const teams = readJSON(DATA + 'teams.json');
const tickets = readJSON(DATA + 'tickets.json');
const ids = teams.map((t) => t.id);
const bankAll = seededShuffle(tickets.filter((t) => t.split === 'bank'), 42);

const model = getGenerativeModel(makeAI(), {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: MODEL,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: Schema.object({
        properties: {
          rules: Schema.array({
            items: Schema.object({ properties: { rule: Schema.string(), team: Schema.enumString({ enum: ids }) } }),
          }),
        },
      }),
    },
  },
});

for (const n of SIZES.split(',').map(Number)) {
  const bank = bankAll.slice(0, n);
  const prompt = [
    'You audit ticket routing for the IT help desk at Northfield State University.',
    'A small on-device model routes new tickets. It sees only the team descriptions below, so it misses local decisions.',
    'Below are past tickets with the team each was correctly routed to.',
    'Write a routing playbook for that small model: the local routing rules these examples show,',
    'above all where the correct team differs from what the team descriptions alone suggest.',
    'Each rule is one short sentence that names the concrete systems, buildings or keywords, and generalises to new tickets.',
    'At most 30 rules. Never include personal names, student IDs, emails or phone numbers.',
    '',
    'Teams:',
    ...teams.map((t) => `- ${t.id}: ${t.description}`),
    '',
    'Past tickets:',
    ...bank.map((b) => `- [${b.team}] ${JSON.stringify(b.text)}`),
  ].join('\n');
  const t0 = Date.now();
  const res = await model.generateContent(prompt);
  const { rules } = JSON.parse(res.response.text());
  writeFileSync(DATA + `learned_rules_${n}.json`, JSON.stringify(rules, null, 2) + '\n');
  const chars = rules.reduce((s, r) => s + r.rule.length, 0);
  console.log(`n=${n}: ${rules.length} rules, ${chars} chars, ${Date.now() - t0} ms, tokens in/out ${res.response.usageMetadata?.promptTokenCount}/${res.response.usageMetadata?.candidatesTokenCount}`);
}
