import type { Team } from './types';

interface Labelled {
  text: string;
  team: string;
}

/** Routing prompt. Kept identical to the eval harness prompt so the measured numbers hold. */
export function buildRoutePrompt(teams: Team[], examples: Labelled[], text: string): string {
  const lines = [
    'You route IT help-desk tickets at Northfield State University to exactly one team.',
    '',
    'Teams:',
    ...teams.map((t) => `- ${t.id}: ${t.description}`),
  ];
  if (examples.length) {
    lines.push(
      '',
      'Past tickets and the team this help desk routed them to. These show local routing decisions; follow them when a new ticket is similar:',
    );
    for (const ex of examples) lines.push(`Ticket: ${JSON.stringify(ex.text)}`, `Team: ${ex.team}`);
  }
  lines.push('', `New ticket: ${JSON.stringify(text)}`, '', 'Reply with JSON: {"team": "<team id>"}');
  return lines.join('\n');
}

/**
 * Cloud check prompt for unsure tickets: the routing prompt (so the measured accuracy holds), with a short
 * reason added. The on-device guess is not included: in testing it can pull the answer toward a wrong team.
 */
export function buildAuditPrompt(teams: Team[], examples: Labelled[], text: string): string {
  return buildRoutePrompt(teams, examples, text).replace(
    'Reply with JSON: {"team": "<team id>"}',
    'Reply with JSON: {"team": "<team id>", "reason": "<at most 15 words a new staff member could reuse for similar tickets>"}',
  );
}
