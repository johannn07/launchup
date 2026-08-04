import { EntityManager } from '@mikro-orm/core';
import { Sector } from '../entities/enums/sector.enum';
import { BusinessModel } from '../entities/enums/business-model.enum';
import { DEFAULT_WEIGHTS } from './readiness.weights';
import { WeightProfileService } from './weight-profile.service';

// Returns a fake EntityManager whose findOne matches the first stored profile
// whose sector/businessModel equal the query, mimicking MikroORM's null match.
function emWith(profiles: any[]) {
  return {
    findOne: jest.fn(async (_entity: unknown, where: any) =>
      profiles.find(
        (p) =>
          (p.sector ?? null) === (where.sector ?? null) &&
          (p.businessModel ?? null) === (where.businessModel ?? null),
      ) ?? null,
    ),
  } as unknown as EntityManager;
}

const HEALTHTECH = {
  id: 2,
  sector: Sector.Healthtech,
  businessModel: null,
  weights: { team: 0.25, market: 0.18, product: 0.17, traction: 0.12, regulatory: 0.2, funding: 0.08 },
};

const GLOBAL = {
  id: 1,
  sector: null,
  businessModel: null,
  weights: { team: 0.3, market: 0.2, product: 0.2, traction: 0.1, regulatory: 0.1, funding: 0.1 },
};

const HEALTHTECH_B2B = {
  id: 3,
  sector: Sector.Healthtech,
  businessModel: BusinessModel.B2B,
  weights: { team: 0.2, market: 0.2, product: 0.2, traction: 0.1, regulatory: 0.2, funding: 0.1 },
};

describe('WeightProfileService.resolve', () => {
  it('step 1: prefers an exact sector and business-model match', async () => {
    const service = new WeightProfileService(emWith([GLOBAL, HEALTHTECH, HEALTHTECH_B2B]));

    const weights = await service.resolve(Sector.Healthtech, BusinessModel.B2B);

    expect(weights).toEqual(HEALTHTECH_B2B.weights);
  });

  it('step 2: falls back to the sector-only profile', async () => {
    const service = new WeightProfileService(emWith([GLOBAL, HEALTHTECH]));

    const weights = await service.resolve(Sector.Healthtech, BusinessModel.B2B);

    expect(weights).toEqual(HEALTHTECH.weights);
  });

  it('step 3: falls back to the global default row', async () => {
    const service = new WeightProfileService(emWith([GLOBAL, HEALTHTECH]));

    const weights = await service.resolve(Sector.Fintech, null);

    expect(weights).toEqual(GLOBAL.weights);
  });

  it('step 4: falls back to the constants when the table is empty', async () => {
    const service = new WeightProfileService(emWith([]));

    const weights = await service.resolve(Sector.Fintech, BusinessModel.B2C);

    expect(weights).toEqual(DEFAULT_WEIGHTS);
  });

  it('resolves to the global row when the startup has no sector', async () => {
    const service = new WeightProfileService(emWith([GLOBAL]));

    const weights = await service.resolve(null, null);

    expect(weights).toEqual(GLOBAL.weights);
  });

  it('falls through a profile whose weights do not sum to 1.0', async () => {
    const broken = { id: 9, sector: Sector.Healthtech, businessModel: null,
      weights: { team: 0.2, market: 0.2, product: 0.2, traction: 0.1, regulatory: 0.05, funding: 0.05 } };
    const service = new WeightProfileService(emWith([GLOBAL, broken]));

    const weights = await service.resolve(Sector.Healthtech, null);

    expect(weights).toEqual(GLOBAL.weights);
  });

  it('falls through a profile missing a dimension', async () => {
    const broken = { id: 9, sector: Sector.Healthtech, businessModel: null,
      weights: { team: 0.3, market: 0.25, product: 0.2, traction: 0.15, funding: 0.1 } };
    const service = new WeightProfileService(emWith([GLOBAL, broken]));

    const weights = await service.resolve(Sector.Healthtech, null);

    expect(weights).toEqual(GLOBAL.weights);
  });

  it('accepts a sum within floating-point tolerance of 1.0', async () => {
    // 0.28 + 0.22 + 0.18 + 0.14 + 0.10 + 0.08 does not sum to exactly 1 in
    // IEEE 754. An exact === 1 check would reject the default profile itself.
    const service = new WeightProfileService(emWith([{ id: 1, sector: null, businessModel: null, weights: DEFAULT_WEIGHTS }]));

    const weights = await service.resolve(null, null);

    expect(weights).toEqual(DEFAULT_WEIGHTS);
  });
});

describe('DEFAULT_WEIGHTS', () => {
  it('sums to 1.0', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((total, w) => total + w, 0);

    expect(sum).toBeCloseTo(1, 5);
  });
});
