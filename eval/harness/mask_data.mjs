// Write eval/data_masked: the same tickets after the app's own mask(), for measuring on what the models really see.
// Usage (from eval/harness): node mask_data.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mask } from '../../src/core/mask.ts';

const src = new URL('../data/', import.meta.url);
const out = new URL('../data_masked/', import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of ['teams.json', 'rules.json']) copyFileSync(new URL(f, src), new URL(f, out));
const tickets = JSON.parse(readFileSync(new URL('tickets.json', src), 'utf8'));
const masked = tickets.map((t) => ({ ...t, text: mask(t.text).text }));
writeFileSync(new URL('tickets.json', out), JSON.stringify(masked, null, 1));
console.log(`masked ${masked.filter((t, i) => t.text !== tickets[i].text).length} of ${tickets.length} tickets`);
