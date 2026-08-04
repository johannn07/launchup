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
