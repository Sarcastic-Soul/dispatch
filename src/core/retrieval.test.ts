import { describe, expect, it } from 'vitest';
import { buildIndex, knnVote, retrieve, tokenize, topK } from './retrieval';
import { BANK_ORDER, HOLDOUT } from './data';
// The JS module the eval harness used for the measured results.
// @ts-expect-error plain JS without types
import * as harness from '../../eval/harness/src/retrieval.js';

describe('retrieval', () => {
  it('tokenizes without stop words', () => {
    expect(tokenize("Hi, I can't print in the Ridgeway lab!")).toEqual(['print', 'ridgeway', 'lab']);
  });

  it('puts the most similar example last', () => {
    const bank = [
      { text: 'wifi drops in my dorm room', team: 'resnet' },
      { text: 'printer out of toner in library', team: 'print-services' },
      { text: 'canvas quiz will not open', team: 'lms-canvas' },
    ];
    const { examples, knn } = retrieve(bank, 'dorm wifi keeps dropping', 2);
    expect(examples.at(-1)?.team).toBe('resnet');
    expect(knn).toBe('resnet');
  });

  it('weights the vote by similarity', () => {
    expect(
      knnVote([
        { team: 'a', score: 0.9 },
        { team: 'b', score: 0.3 },
        { team: 'b', score: 0.3 },
      ]),
    ).toBe('a');
    expect(knnVote([])).toBeNull();
  });

  it('matches the eval harness exactly (same neighbours and votes)', () => {
    const bank = BANK_ORDER.slice(0, 120);
    const ts = buildIndex(bank.map((b) => tokenize(b.text)));
    const js = harness.buildIndex(bank.map((b) => harness.tokenize(b.text)));
    let right = 0;
    for (const t of HOLDOUT.slice(0, 80)) {
      const a = topK(ts, tokenize(t.text), 8);
      const b = harness.topK(js, harness.tokenize(t.text), 8) as { i: number; score: number }[];
      expect(a.map((h) => h.i)).toEqual(b.map((h) => h.i));
      const vote = knnVote(a.map((h) => ({ team: bank[h.i].team, score: h.score })));
      expect(vote).toBe(harness.knnVote(b.map((h) => ({ team: bank[h.i].team, score: h.score }))));
      if (vote === t.team) right++;
    }
    // RESULTS.md: plain kNN vote with a bank of 120 = 46% on the 80 held-out tickets.
    expect(Math.round((100 * right) / 80)).toBe(46);
  });
});
