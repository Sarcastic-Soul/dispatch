// Shared by the browser spike (run.js) and the Node cloud runner (cloud.mjs).

// Deterministic shuffle so bank subsets are nested and repeatable.
export function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed >>> 0;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildPrompt(teams, examples, text, rules = []) {
  const lines = [
    'You route IT help-desk tickets at Northfield State University to exactly one team.',
    '',
    'Teams:',
    ...teams.map((t) => `- ${t.id}: ${t.description}`),
  ];
  if (rules.length) {
    lines.push('', 'Local routing rules for this help desk. They override the team descriptions:');
    for (const r of rules) lines.push(`- ${r.rule} -> ${r.team}`);
  }
  if (examples.length) {
    lines.push('', 'Past tickets and the team this help desk routed them to. These show local routing decisions; follow them when a new ticket is similar:');
    for (const ex of examples) lines.push(`Ticket: ${JSON.stringify(ex.text)}`, `Team: ${ex.team}`);
  }
  lines.push('', `New ticket: ${JSON.stringify(text)}`, '', 'Reply with JSON: {"team": "<team id>"}');
  return lines.join('\n');
}
