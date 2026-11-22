import { mask } from './mask';
import { decide } from './policy';
import { buildAuditPrompt, buildRoutePrompt } from './prompts';
import { retrieve } from './retrieval';
import type { Decision, Example, Masked, RouteResult, Team } from './types';

export interface TriageOptions {
  teams: Team[];
  bank: Example[];
  k: number;
  auditSampleRate: number;
  escalateOnDisagreement: boolean;
  /** Runs the routing prompt, normally on-device. Injected so tests need no browser. */
  route: (prompt: string) => Promise<RouteResult>;
  random?: () => number;
}

export interface Triage {
  raw: string;
  masked: Masked;
  examples: Example[];
  knn: string | null;
  device: RouteResult;
  decision: Decision;
}

/** Step 1 for every ticket: mask, retrieve similar past tickets, route on-device, decide if it is unsure. */
export async function triage(raw: string, opts: TriageOptions): Promise<Triage> {
  const masked = mask(raw);
  const { examples, knn } = retrieve(opts.bank, masked.text, opts.k);
  const device = await opts.route(buildRoutePrompt(opts.teams, examples, masked.text));
  // An answer outside the team list counts as no answer.
  if (device.team && !opts.teams.some((t) => t.id === device.team)) device.team = null;
  const decision = decide({
    devicePred: device.team,
    knnPred: knn,
    bankSize: opts.bank.length,
    auditSampleRate: opts.auditSampleRate,
    escalateOnDisagreement: opts.escalateOnDisagreement,
    random: opts.random,
  });
  return { raw, masked, examples, knn, device, decision };
}

/** Step 2, only for unsure tickets, only after the staffer has seen the masked text: what the cloud is sent. */
export function auditPrompt(t: Triage, teams: Team[]): string {
  return buildAuditPrompt(teams, t.examples, t.masked.text);
}
