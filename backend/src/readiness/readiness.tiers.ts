export type TierSpec = { tierLabel: string; threshold: number };

/**
 * The default classification tiers, highest threshold first.
 *
 * Both the `tier_configs` seeder and `ReadinessService`'s fallback read this
 * list, so an unseeded database classifies a score exactly as a seeded one
 * does — and `/admin/tiers` shows the thresholds scoring actually applied
 * rather than an empty table.
 *
 * A Manager can edit the rows through `/admin/tiers`; `upsertTierConfigs`
 * replaces the whole set, and the seeder never overwrites what it finds.
 */
export const SEED_TIER_CONFIGS: TierSpec[] = [
  { tierLabel: 'Strong', threshold: 85 },
  { tierLabel: 'Ready', threshold: 70 },
  { tierLabel: 'Emerging', threshold: 55 },
  { tierLabel: 'Developing', threshold: 40 },
  { tierLabel: 'Early', threshold: 25 },
];
