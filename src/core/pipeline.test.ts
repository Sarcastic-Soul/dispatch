import { describe, expect, it, vi } from 'vitest';
import { decide } from './policy';
import { auditPrompt, triage } from './pipeline';
import { buildRoutePrompt } from './prompts';
import { TEAMS } from './data';
import type { Example } from './types';

const ex = (text: string, team: string): Example => ({ id: text, text, team, source: 'seed', createdAt: 0 });
const BANK = [
  ex('wifi drops in my dorm room every night', 'resnet'),
  ex('dorm ethernet port dead in my residence hall room', 'resnet'),
  ex('printer in the library is out of toner', 'print-services'),
  ex('canvas quiz will not open for my students', 'lms-canvas'),
];

describe('decide', () => {
  const base = { auditSampleRate: 0, random: () => 0.5 };
  it('escalates with no examples', () => {
    expect(decide({ ...base, devicePred: 'resnet', knnPred: null, bankSize: 0 })).toEqual({ escalate: true, why: 'no-examples' });
  });
  it('escalates on disagreement, keeps agreement on-device', () => {
    expect(decide({ ...base, devicePred: 'resnet', knnPred: 'lms-canvas', bankSize: 4 }).why).toBe('disagree');
    expect(decide({ ...base, devicePred: 'resnet', knnPred: 'resnet', bankSize: 4 })).toEqual({ escalate: false, why: null });
  });
  it('escalates when the device gave no answer, even with the switch off', () => {
    expect(decide({ ...base, devicePred: null, knnPred: 'resnet', bankSize: 4, escalateOnDisagreement: false }).escalate).toBe(true);
  });
  it('respects the disagreement switch', () => {
    expect(decide({ ...base, devicePred: 'resnet', knnPred: 'lms-canvas', bankSize: 4, escalateOnDisagreement: false }).escalate).toBe(false);
  });
  it('samples confident tickets at the audit rate', () => {
    const d = decide({ devicePred: 'resnet', knnPred: 'resnet', bankSize: 4, auditSampleRate: 0.1, random: () => 0.05 });
    expect(d).toEqual({ escalate: true, why: 'sample' });
  });
});

describe('triage', () => {
  const opts = { teams: TEAMS, bank: BANK, k: 8, auditSampleRate: 0, escalateOnDisagreement: true, random: () => 0.99 };

  it('never sends personal details to the model', async () => {
    const route = vi.fn(async () => ({ team: 'resnet', where: 'on_device' as const, ms: 5 }));
    const t = await triage('wifi dead in my dorm. N07015528 - Peter Lindgren', { ...opts, route });
    const sent = (route.mock.calls[0] as unknown as [string])[0];
    expect(sent).not.toContain('N07015528');
    expect(sent).not.toContain('Lindgren');
    expect(sent).toContain('[STUDENT_ID]');
    expect(auditPrompt(t, TEAMS)).not.toContain('Lindgren');
    expect(t.decision.escalate).toBe(false);
  });

  it('marks the ticket unsure when device and neighbours disagree', async () => {
    const route = async () => ({ team: 'lms-canvas', where: 'on_device' as const, ms: 5 });
    const t = await triage('wifi keeps dropping in my dorm room', { ...opts, route });
    expect(t.knn).toBe('resnet');
    expect(t.decision).toEqual({ escalate: true, why: 'disagree' });
  });

  it('treats an unknown team as no answer', async () => {
    const route = async () => ({ team: 'made-up-team', where: 'on_device' as const, ms: 5 });
    const t = await triage('wifi keeps dropping in my dorm room', { ...opts, route });
    expect(t.device.team).toBeNull();
    expect(t.decision.escalate).toBe(true);
  });

  it('uses the same prompt text as the eval harness', async () => {
    // @ts-expect-error plain JS without types
    const harness = await import('../../eval/harness/src/common.js');
    const examples = BANK.slice(0, 2);
    expect(buildRoutePrompt(TEAMS, examples, 'new ticket')).toBe(harness.buildPrompt(TEAMS, examples, 'new ticket'));
  });
});
