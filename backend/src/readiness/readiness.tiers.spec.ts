import { SEED_TIER_CONFIGS } from './readiness.tiers';

describe('SEED_TIER_CONFIGS', () => {
  it('seeds the five classification tiers', () => {
    expect(SEED_TIER_CONFIGS).toHaveLength(5);
    expect(SEED_TIER_CONFIGS.map((t) => t.tierLabel)).toEqual([
      'Strong',
      'Ready',
      'Emerging',
      'Developing',
      'Early',
    ]);
  });

  it('is ordered by descending threshold', () => {
    const thresholds = SEED_TIER_CONFIGS.map((t) => t.threshold);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => b - a));
  });

  // The lowest tier is the floor a score below every other threshold falls to,
  // so it has to sit at or below the bottom of the 0-100 composite range.
  it('bottoms out at or below the lowest reachable score', () => {
    const lowest = SEED_TIER_CONFIGS[SEED_TIER_CONFIGS.length - 1];
    expect(lowest.threshold).toBeLessThanOrEqual(25);
  });

  it('has no duplicate labels or thresholds', () => {
    expect(new Set(SEED_TIER_CONFIGS.map((t) => t.tierLabel)).size).toBe(5);
    expect(new Set(SEED_TIER_CONFIGS.map((t) => t.threshold)).size).toBe(5);
  });
});
