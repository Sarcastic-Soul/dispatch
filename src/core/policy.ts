import type { Decision } from './types';

export interface PolicyInput {
  devicePred: string | null;
  knnPred: string | null;
  bankSize: number;
  /** Share of confident tickets also checked by the cloud, to keep measuring on-device accuracy. */
  auditSampleRate: number;
  /** Admin switch (Remote Config). Off means only empty-bank and sampled tickets reach the cloud. */
  escalateOnDisagreement?: boolean;
  random?: () => number;
}

/**
 * When does a ticket need the cloud?
 * - no examples yet: the on-device model alone was 36% accurate in our test, so every ticket is checked;
 * - the on-device answer disagrees with the teams of the most similar past tickets
 *   (in our test this caught 87% of on-device errors);
 * - otherwise a small random sample, so accuracy keeps being measured.
 */
export function decide({
  devicePred,
  knnPred,
  bankSize,
  auditSampleRate,
  escalateOnDisagreement = true,
  random = Math.random,
}: PolicyInput): Decision {
  if (bankSize === 0 || knnPred === null) return { escalate: true, why: 'no-examples' };
  // No on-device answer at all (model missing or failed): the ticket cannot be routed without help.
  if (devicePred === null) return { escalate: true, why: 'disagree' };
  if (escalateOnDisagreement && devicePred !== knnPred) return { escalate: true, why: 'disagree' };
  if (random() < auditSampleRate) return { escalate: true, why: 'sample' };
  return { escalate: false, why: null };
}
