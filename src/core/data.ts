import teamsJson from '../data/teams.json';
import ticketsJson from '../data/tickets.json';
import type { Team } from './types';

export interface LabelledTicket {
  id: string;
  text: string;
  team: string;
  split: 'bank' | 'holdout';
  rule: string | null;
  ambiguous: boolean;
}

export const TEAMS: Team[] = teamsJson as Team[];
export const TEAM_IDS = TEAMS.map((t) => t.id);
export const TICKETS = ticketsJson as LabelledTicket[];

/** Same deterministic shuffle as the eval harness, so the seed bank matches the measured runs. */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed >>> 0;
  const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Bank tickets in the order the eval grew the bank (first 20 = bank-20, and so on). */
export const BANK_ORDER = seededShuffle(
  TICKETS.filter((t) => t.split === 'bank'),
  42,
);

/** Held-out tickets, never in the seed bank; the demo inbox replays these. */
export const HOLDOUT = TICKETS.filter((t) => t.split === 'holdout');

export function teamName(id: string | null | undefined): string {
  return TEAMS.find((t) => t.id === id)?.name ?? id ?? '—';
}
