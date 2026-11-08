import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ReadinessType } from 'src/entities/enums/readiness-type.enum';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';
import { ReadinessEvaluation } from 'src/entities/readiness-evaluation.entity';
import { ReadinessGap } from 'src/entities/readiness-gap.entity';
import { TierConfig } from 'src/entities/tier-config.entity';
import { SEED_TIER_CONFIGS } from './readiness.tiers';
import { Startup } from 'src/entities/startup.entity';
import { DEFAULT_WEIGHTS, DimensionKey } from './readiness.weights';
import { WeightProfileService } from './weight-profile.service';
import { ConfigAlertService } from './config-alert.service';

// The rubric runs 1-9 for every dimension; scores are a fraction of 9.
const MAX_LEVEL = 9;

type ReadinessDimension = {
  key: DimensionKey;
  label: string;
  readinessType: ReadinessType;
  rationale: string;
};

// Keys predate the canonical names and are stored in weight_profiles.weights
// and readiness_gaps.dimension_key, so they stay; the label is the dimension.
const DIMENSION_BY_TYPE: Record<ReadinessType, Pick<ReadinessDimension, 'key' | 'rationale'>> = {
  [ReadinessType.T]: {
    key: 'product',
    rationale: 'Technology readiness tracks how far the core technology has moved from concept to a proven, working system. A working product is necessary, but it does not show that anyone will buy or use it.',
  },
  [ReadinessType.M]: {
    key: 'market',
    rationale: 'Market readiness tracks evidence of demand: a defined customer, a sized opportunity and validated willingness to pay. Clear demand is the strongest proof that the opportunity is worth pursuing.',
  },
  [ReadinessType.R]: {
    key: 'regulatory',
    rationale: 'Regulatory readiness gates market entry in licensed sectors, so it carries more weight for health and finance startups than elsewhere.',
  },
  [ReadinessType.A]: {
    key: 'team',
    rationale: 'Acceptance readiness tracks whether target users and stakeholders take up the solution, through pilots, repeat use and endorsements. A product nobody adopts cannot progress on the other dimensions.',
  },
  [ReadinessType.O]: {
    key: 'traction',
    rationale: 'Organizational readiness tracks whether the team, processes and partnerships can deliver and scale the solution. It decides whether progress on the other dimensions can be sustained.',
  },
  [ReadinessType.I]: {
    key: 'funding',
    rationale: 'Investment readiness tracks financial position and preparedness to raise capital. It is treated as a supporting signal, because funding tends to follow progress on the other dimensions.',
  },
};

// Canonical order and names come from ReadinessType, not a restated list.
const READINESS_DIMENSIONS: ReadinessDimension[] = Object.values(ReadinessType).map(
  (readinessType) => ({ readinessType, label: readinessType, ...DIMENSION_BY_TYPE[readinessType] }),
);

export type ReadinessScoreResponse = {
  compositeScore: number;
  tierLabel: string;
  tierThreshold: number;
  dimensions: Array<{
    key: DimensionKey;
    label: string;
    readinessType: ReadinessType;
    score: number;
    percent: number;
    weight: number;
    weightedScore: number;
    rationale: string;
    /** Points below the current tier's threshold, at least 0 (SRS 2.3). */
    shortfall: number;
  }>;
  recommendations: Array<{
    priority: number;
    urgency: 'High' | 'Medium' | 'Low';
    dimension: DimensionKey;
    title: string;
    details: string;
  }>;
  weightRationale: Array<{
    key: DimensionKey;
    label: string;
    weight: number;
    rationale: string;
  }>;
};

@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly weightProfiles: WeightProfileService,
    @Optional() private readonly alerts?: ConfigAlertService,
  ) {}

  getWeightRationale(weights: Record<DimensionKey, number> = DEFAULT_WEIGHTS) {
    return READINESS_DIMENSIONS.map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      weight: weights[dimension.key],
      rationale: dimension.rationale,
    }));
  }

  async getReadinessForStartup(startupId: number): Promise<ReadinessScoreResponse> {
    const levels = await this.em.find(
      StartupReadinessLevel,
      { startup: startupId },
      { populate: ['readinessLevel'] },
    );

    const levelByType = new Map<ReadinessType, number>();
    for (const level of levels) {
      if (level.readinessLevel?.readinessType) {
        levelByType.set(level.readinessLevel.readinessType, level.readinessLevel.level ?? 0);
      }
    }

    const startup = await this.em.findOne(Startup, { id: startupId });
    const weights = await this.weightProfiles.resolve(
      startup?.sector ?? null,
      startup?.businessModel ?? null,
    );

    const dimensions = READINESS_DIMENSIONS.map((dimension) => {
      const score = Math.max(0, Math.min(MAX_LEVEL, levelByType.get(dimension.readinessType) ?? 0));
      const percent = Math.round((score / MAX_LEVEL) * 100);
      const weight = weights[dimension.key];
      const weightedScore = Number(((percent / 100) * weight * 100).toFixed(2));

      return {
        key: dimension.key,
        label: dimension.label,
        readinessType: dimension.readinessType,
        score,
        percent,
        weight,
        weightedScore,
        rationale: dimension.rationale,
      };
    });

    const compositeScore = Math.round(
      dimensions.reduce((total, dimension) => total + dimension.weightedScore, 0),
    );

    // Manager-configured thresholds, falling back to the same defaults the
    // seeder writes — so an unseeded database classifies identically.
    const sortedTiers = (await this.loadTiers())
      .slice()
      .sort((a, b) => b.threshold - a.threshold);

    // Start at the lowest tier so a score below every threshold still lands.
    let tierLabel = sortedTiers[sortedTiers.length - 1].tierLabel;
    let tierThreshold = sortedTiers[sortedTiers.length - 1].threshold;

    for (const tier of sortedTiers) {
      if (compositeScore >= tier.threshold) {
        tierLabel = tier.tierLabel;
        tierThreshold = tier.threshold;
        break;
      }
    }

    const scored = dimensions.map((dimension) => ({
      ...dimension,
      shortfall: Math.max(0, tierThreshold - dimension.percent),
    }));

    const recommendations = [...dimensions]
      .sort((left, right) => left.weightedScore - right.weightedScore)
      .slice(0, 3)
      .map((dimension, index) => {
        const urgency: 'High' | 'Medium' | 'Low' =
          dimension.percent <= 35
            ? 'High'
            : dimension.percent <= 60
              ? 'Medium'
              : 'Low';

        return {
          priority: index + 1,
          urgency,
          dimension: dimension.key,
          title: `Improve ${dimension.label.toLowerCase()} readiness`,
          details: `This dimension is currently at ${dimension.percent}%. Focus on actions that can lift ${dimension.label.toLowerCase()} by one level over the next cycle.`,
        };
      });

    const response: ReadinessScoreResponse = {
      compositeScore,
      tierLabel,
      tierThreshold,
      dimensions: scored,
      recommendations,
      weightRationale: this.getWeightRationale(weights),
    };

    const isProvisional = dimensions.some((dimension) => dimension.score === 0);

    try {
      // A new row only when something changed: every dashboard view used to
      // add one, and the whole history ships with every startup response.
      const latest = await this.em.findOne(
        ReadinessEvaluation,
        { startup: startupId },
        { orderBy: { id: 'DESC' }, populate: ['gaps'] },
      );
      if (
        latest &&
        this.matchesEvaluation(latest, {
          compositeScore,
          tierLabel,
          isProvisional,
          tierThreshold,
          dimensions,
        })
      ) {
        return response;
      }

      const evaluation = this.em.create(ReadinessEvaluation, {
        startup: startupId,
        compositeScore,
        tierLabel: tierLabel,
        isProvisional,
        warning: isProvisional
          ? 'One or more readiness dimensions are missing, so the score should be treated as provisional.'
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.em.persist(evaluation);
      await this.em.flush();

      for (const dimension of scored) {
        this.em.persist(
          this.em.create(ReadinessGap, {
            evaluation,
            dimensionKey: dimension.key,
            score: dimension.percent,
            tierThreshold,
            shortfall: dimension.shortfall,
            createdAt: new Date(),
          }),
        );
      }

      await this.em.flush();
    } catch (error) {
      this.logger.warn(
        `Failed to persist readiness evaluation for startup ${startupId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return response;
  }

  /** Usable tier rows; unusable ones are skipped and alerted, as weight profiles are. */
  private async loadTiers(): Promise<Array<{ tierLabel: string; threshold: number }>> {
    const persisted = await this.em.find(TierConfig, {});
    if (persisted.length === 0) return SEED_TIER_CONFIGS;

    const valid = persisted.filter(
      (t) =>
        t.tierLabel?.trim() &&
        Number.isFinite(t.threshold) &&
        t.threshold >= 0 &&
        t.threshold <= 100,
    );
    const invalid = persisted.filter((t) => !valid.includes(t));
    if (invalid.length > 0) {
      const rows = invalid
        .map((t) => `"${t.tierLabel ?? ''}" at ${t.threshold}`)
        .join(', ');
      await this.alerts?.raise(
        valid.length > 0
          ? `Tier configuration has unusable rows (${rows}); they are skipped.`
          : `Tier configuration has no usable rows (${rows}); the default tiers are used.`,
      );
    }
    return valid.length > 0 ? valid : SEED_TIER_CONFIGS;
  }

  /** Same score, tier, flag and per-dimension gap rows as the stored evaluation. */
  private matchesEvaluation(
    latest: ReadinessEvaluation,
    next: {
      compositeScore: number;
      tierLabel: string;
      isProvisional: boolean;
      tierThreshold: number;
      dimensions: { key: string; percent: number }[];
    },
  ) {
    if (
      latest.compositeScore !== next.compositeScore ||
      latest.tierLabel !== next.tierLabel ||
      latest.isProvisional !== next.isProvisional
    ) {
      return false;
    }
    const gaps = latest.gaps.getItems();
    return (
      gaps.length === next.dimensions.length &&
      next.dimensions.every((dimension) =>
        gaps.some(
          (gap) =>
            gap.dimensionKey === dimension.key &&
            gap.score === dimension.percent &&
            gap.tierThreshold === next.tierThreshold,
        ),
      )
    );
  }
}
