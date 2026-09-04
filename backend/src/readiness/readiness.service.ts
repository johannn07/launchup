import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { ReadinessType } from 'src/entities/enums/readiness-type.enum';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';
import { ReadinessEvaluation } from 'src/entities/readiness-evaluation.entity';
import { ReadinessGap } from 'src/entities/readiness-gap.entity';
import { TierConfig } from 'src/entities/tier-config.entity';
import { SEED_TIER_CONFIGS } from './readiness.tiers';
import { Startup } from 'src/entities/startup.entity';
import { DEFAULT_WEIGHTS, DimensionKey } from './readiness.weights';
import { WeightProfileService } from './weight-profile.service';

// The rubric runs 1-9 for every dimension; scores are a fraction of 9.
const MAX_LEVEL = 9;

type ReadinessDimension = {
  key: DimensionKey;
  label: string;
  readinessType: ReadinessType;
  rationale: string;
};

const READINESS_DIMENSIONS: ReadinessDimension[] = [
  {
    key: 'team',
    label: 'Team',
    readinessType: ReadinessType.A,
    rationale: 'Team readiness is weighted highest because execution quality is the main multiplier for the rest of the startup.',
  },
  {
    key: 'market',
    label: 'Market',
    readinessType: ReadinessType.M,
    rationale: 'Market readiness is critical because clear demand is the strongest proof that the opportunity is worth pursuing.',
  },
  {
    key: 'product',
    label: 'Product',
    readinessType: ReadinessType.T,
    rationale: 'Product readiness is important, but it can move quickly once the team and market are clear.',
  },
  {
    key: 'traction',
    label: 'Traction',
    readinessType: ReadinessType.O,
    rationale: 'Traction differentiates the startup stage and validates momentum, but it should not overshadow fit signals.',
  },
  {
    key: 'regulatory',
    label: 'Regulatory',
    readinessType: ReadinessType.R,
    rationale: 'Regulatory readiness gates market entry in licensed sectors, so it carries more weight for health and finance startups than elsewhere.',
  },
  {
    key: 'funding',
    label: 'Funding',
    readinessType: ReadinessType.I,
    rationale: 'Funding supports execution capacity, but it is treated as a supporting signal rather than the core score.',
  },
];

export type ReadinessScoreResponse = {
  compositeScore: number;
  tierLabel: string;
  dimensions: Array<{
    key: DimensionKey;
    label: string;
    readinessType: ReadinessType;
    score: number;
    percent: number;
    weight: number;
    weightedScore: number;
    rationale: string;
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
    const persisted = await this.em.find(TierConfig, {});
    const sortedTiers = (persisted.length > 0 ? persisted : SEED_TIER_CONFIGS)
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
      dimensions,
      recommendations,
      weightRationale: this.getWeightRationale(weights),
    };

    try {
      const evaluation = this.em.create(ReadinessEvaluation, {
        startup: startupId,
        compositeScore,
        tierLabel: tierLabel,
        isProvisional: dimensions.some((dimension) => dimension.score === 0),
        warning: dimensions.some((dimension) => dimension.score === 0)
          ? 'One or more readiness dimensions are missing, so the score should be treated as provisional.'
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.em.persist(evaluation);
      await this.em.flush();

      for (const dimension of dimensions) {
        const gap = Math.max(0, tierThreshold - dimension.percent);
        this.em.persist(
          this.em.create(ReadinessGap, {
            evaluation,
            dimensionKey: dimension.key,
            score: dimension.percent,
            tierThreshold,
            shortfall: gap,
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
}
