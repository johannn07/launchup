import { Sector } from 'src/entities/enums/sector.enum';
import { BusinessModel } from 'src/entities/enums/business-model.enum';

export type DimensionKey =
  | 'team'
  | 'market'
  | 'product'
  | 'traction'
  | 'regulatory'
  | 'funding';

export const DIMENSION_KEYS: DimensionKey[] = [
  'team',
  'market',
  'product',
  'traction',
  'regulatory',
  'funding',
];

// Authored, not derived from any published framework — see the design doc.
// They preserve the relative ordering of the five constants they replace and
// give Regulatory a mid-low share.
export const DEFAULT_WEIGHTS: Record<DimensionKey, number> = {
  team: 0.28,
  market: 0.22,
  product: 0.18,
  traction: 0.14,
  regulatory: 0.1,
  funding: 0.08,
};

// Float summation makes an exact === 1 comparison unreliable.
export const WEIGHT_SUM_TOLERANCE = 0.001;

export type SeedWeightProfile = {
  sector: Sector | null;
  businessModel: BusinessModel | null;
  weights: Record<DimensionKey, number>;
};

// Authored, no external source. Agritech shifts weight toward market and
// traction; healthtech toward regulatory, because clinical and data
// regulation gates the business.
export const SEED_WEIGHT_PROFILES: SeedWeightProfile[] = [
  { sector: null, businessModel: null, weights: DEFAULT_WEIGHTS },
  {
    sector: Sector.Agritech,
    businessModel: null,
    weights: { team: 0.24, market: 0.28, product: 0.16, traction: 0.18, regulatory: 0.06, funding: 0.08 },
  },
  {
    sector: Sector.Healthtech,
    businessModel: null,
    weights: { team: 0.25, market: 0.18, product: 0.17, traction: 0.12, regulatory: 0.2, funding: 0.08 },
  },
];
