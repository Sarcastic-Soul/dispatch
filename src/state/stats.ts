import type { TicketEvent } from '../core/store';

/**
 * Measured offline on held-out tickets; see eval/RESULTS.md. Every number here must match that file.
 * `hybrid` is the largest bank size where the on-device run and the cloud check run saw the same examples.
 */
export const MEASURED = {
  tickets: 80,
  kept: [
    { bank: 20, share: 0.14 },
    { bank: 60, share: 0.3 },
    { bank: 120, share: 0.39 },
  ],
  deviceAcc: [
    { bank: 0, acc: 0.36 },
    { bank: 20, acc: 0.49 },
    { bank: 60, acc: 0.52 },
    { bank: 120, acc: 0.62 },
  ],
  hybrid: { bank: 120, acc: 0.84, allCloudAcc: 0.84, keptAcc: 0.87 },
};

export const lastKept = MEASURED.kept[MEASURED.kept.length - 1];
export const firstAcc = MEASURED.deviceAcc[0];
export const lastAcc = MEASURED.deviceAcc[MEASURED.deviceAcc.length - 1];

export interface Ratio {
  right: number;
  n: number;
}

export interface Stats {
  total: number;
  kept: number;
  cloudCalls: number;
  /** On-device answer accuracy on labelled demo tickets. */
  deviceAcc: Ratio;
  /** Final team accuracy on labelled demo tickets. */
  systemAcc: Ratio;
  /** Share kept on-device per run of 10 tickets, plotted against the bank size at the time. */
  windows: { bank: number; share: number; n: number }[];
}

export function computeStats(events: TicketEvent[], windowSize = 10): Stats {
  const labelled = events.filter((e) => e.gold);
  const windows: Stats['windows'] = [];
  for (let i = 0; i + windowSize <= events.length; i += windowSize) {
    const w = events.slice(i, i + windowSize);
    windows.push({
      bank: w.reduce((s, e) => s + e.bankSize, 0) / w.length,
      share: w.filter((e) => !e.escalated).length / w.length,
      n: w.length,
    });
  }
  return {
    total: events.length,
    kept: events.filter((e) => !e.escalated).length,
    cloudCalls: events.filter((e) => e.cloudTeam !== null).length,
    deviceAcc: { right: labelled.filter((e) => e.devicePred === e.gold).length, n: labelled.length },
    systemAcc: { right: labelled.filter((e) => e.finalTeam === e.gold).length, n: labelled.length },
    windows,
  };
}

export const pct = (r: Ratio | number, digits = 0) => {
  const v = typeof r === 'number' ? r : r.n ? r.right / r.n : NaN;
  return Number.isFinite(v) ? `${(100 * v).toFixed(digits)}%` : '—';
};
