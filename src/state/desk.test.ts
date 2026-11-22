import { describe, expect, it } from 'vitest';
import { friendlyError, perMinuteWait } from './desk';

const perMinute =
  'AI: Error fetching ...: [429 ] You exceeded your current quota. * Quota exceeded for metric: generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite, description: Generate content requests per minute limit exceeded on Free Tier. Please retry in 46.36s.';
const perDay =
  'AI: Error fetching ...: [429 ] You exceeded your current quota. description: Generate content requests per day limit exceeded on Free Tier.';

describe('Gemini quota errors', () => {
  it('waits out the per-minute limit, capped at 60 s', () => {
    expect(perMinuteWait(perMinute)).toBeCloseTo(46.36);
    expect(perMinuteWait(perMinute.replace('46.36', '90'))).toBe(60);
    expect(perMinuteWait(perDay)).toBe(0);
    expect(perMinuteWait('network error')).toBe(0);
  });
  it('tells the two limits apart', () => {
    expect(friendlyError(perMinute)).toMatch(/15 requests a minute/);
    expect(friendlyError(perDay)).toMatch(/daily limit/);
  });
});
