import { EntityManager } from '@mikro-orm/core';
import { ReadinessType } from '../entities/enums/readiness-type.enum';
import { Sector } from '../entities/enums/sector.enum';
import { DEFAULT_WEIGHTS } from './readiness.weights';
import { ReadinessService } from './readiness.service';
import { WeightProfileService } from './weight-profile.service';

const HEALTHTECH_WEIGHTS = {
  team: 0.25, market: 0.18, product: 0.17, traction: 0.12, regulatory: 0.2, funding: 0.08,
};

// levels is a list of [readinessType, level] pairs, matching the seeder's shape.
function emWith(levels: Array<[ReadinessType, number]>, sector: Sector | null = null) {
  return {
    find: jest.fn(async (entity: any) => {
      // Second call is for TierConfig; an empty result exercises the fallback
      // ladder, which is what runs in production (tier_configs has 0 rows).
      if (entity?.name === 'TierConfig') return [];
      return levels.map(([readinessType, level]) => ({ readinessLevel: { level, readinessType } }));
    }),
    findOne: jest.fn(async () => ({ id: 1, sector, businessModel: null })),
    create: jest.fn(() => ({})),
    persist: jest.fn(),
    flush: jest.fn(async () => undefined),
  } as unknown as EntityManager;
}

function serviceWith(em: EntityManager, weights = DEFAULT_WEIGHTS) {
  const profiles = { resolve: jest.fn(async () => weights) } as unknown as WeightProfileService;
  return new ReadinessService(em, profiles);
}

const AGROLINK: Array<[ReadinessType, number]> = [
  [ReadinessType.A, 1], [ReadinessType.M, 2], [ReadinessType.T, 2],
  [ReadinessType.O, 2], [ReadinessType.R, 1], [ReadinessType.I, 1],
];

const MEDISYNC: Array<[ReadinessType, number]> = [
  [ReadinessType.A, 3], [ReadinessType.M, 4], [ReadinessType.T, 5],
  [ReadinessType.O, 4], [ReadinessType.R, 3], [ReadinessType.I, 3],
];

describe('ReadinessService', () => {
  it('returns a weighted score, tier, and prioritized recommendations', async () => {
    const em = emWith(MEDISYNC);
    const result = await serviceWith(em).getReadinessForStartup(12);

    // Two find() calls: readiness levels, then tier configs.
    expect(em.find).toHaveBeenCalledTimes(2);
    expect(em.findOne).toHaveBeenCalledTimes(1);
    expect(result.compositeScore).toBeGreaterThan(0);
    expect(result.tierLabel).toBeDefined();
    expect(result.dimensions).toHaveLength(6);
    expect(result.recommendations).toHaveLength(3);
    expect(result.weightRationale).toHaveLength(6);
    expect(result.recommendations[0].priority).toBe(1);
  });

  it('exposes weight rationale for the UI', () => {
    const rationale = serviceWith(emWith([])).getWeightRationale();

    expect(rationale.map((item) => item.key)).toEqual([
      'team', 'market', 'product', 'traction', 'regulatory', 'funding',
    ]);
  });

  it('scores the seeded early-stage startup at 17', async () => {
    const result = await serviceWith(emWith(AGROLINK)).getReadinessForStartup(1);

    expect(result.compositeScore).toBe(17);
    expect(result.tierLabel).toBe('Early');
  });

  it('scores the seeded mid-stage startup at 41', async () => {
    const result = await serviceWith(emWith(MEDISYNC)).getReadinessForStartup(2);

    expect(result.compositeScore).toBe(41);
    expect(result.tierLabel).toBe('Developing');
  });

  it('divides by 9, not 5 — a level 9 outscores a level 5', async () => {
    const at5 = await serviceWith(emWith([[ReadinessType.T, 5]])).getReadinessForStartup(1);
    const at9 = await serviceWith(emWith([[ReadinessType.T, 9]])).getReadinessForStartup(1);

    expect(at9.compositeScore).toBeGreaterThan(at5.compositeScore);

    const product9 = at9.dimensions.find((d) => d.key === 'product');
    expect(product9?.percent).toBe(100);
  });

  it('scores the Regulatory dimension', async () => {
    const result = await serviceWith(emWith(MEDISYNC)).getReadinessForStartup(2);
    const regulatory = result.dimensions.find((d) => d.key === 'regulatory');

    expect(regulatory).toBeDefined();
    expect(regulatory?.readinessType).toBe(ReadinessType.R);
    expect(regulatory?.percent).toBe(33);
  });

  // Real startups have narrow level spreads, so sector weighting moves their
  // score by about a point. This fixture has a wide spread on purpose, so the
  // mechanism is provable even though production data cannot show it.
  it('applies the resolved profile — a regulatory-heavy startup scores higher under healthtech', async () => {
    const spread: Array<[ReadinessType, number]> = [
      [ReadinessType.A, 1], [ReadinessType.M, 1], [ReadinessType.T, 1],
      [ReadinessType.O, 1], [ReadinessType.R, 9], [ReadinessType.I, 1],
    ];

    const underDefault = await serviceWith(emWith(spread)).getReadinessForStartup(3);
    const underHealthtech = await serviceWith(
      emWith(spread, Sector.Healthtech), HEALTHTECH_WEIGHTS,
    ).getReadinessForStartup(3);

    expect(underDefault.compositeScore).toBe(20);
    expect(underHealthtech.compositeScore).toBe(29);
  });

  it('passes the startup sector to the weight resolver', async () => {
    const em = emWith(MEDISYNC, Sector.Healthtech);
    const profiles = { resolve: jest.fn(async () => DEFAULT_WEIGHTS) } as unknown as WeightProfileService;

    await new ReadinessService(em, profiles).getReadinessForStartup(2);

    expect(profiles.resolve).toHaveBeenCalledWith(Sector.Healthtech, null);
  });

  it('passes a null sector through to the resolver rather than crashing or coercing it', async () => {
    const em = emWith(AGROLINK, null);
    const profiles = { resolve: jest.fn(async () => DEFAULT_WEIGHTS) } as unknown as WeightProfileService;

    await new ReadinessService(em, profiles).getReadinessForStartup(1);

    expect(profiles.resolve).toHaveBeenCalledWith(null, null);
  });
});
