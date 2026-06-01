import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { ReadinessType } from 'src/entities/enums/readiness-type.enum';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';
import { ReadinessEvaluation } from 'src/entities/readiness-evaluation.entity';
import { ReadinessGap } from 'src/entities/readiness-gap.entity';
import { TierConfig } from 'src/entities/tier-config.entity';

// Team readiness gets the highest weight because execution quality and decision speed
// determine whether the startup can turn plans into consistent progress.
const TEAM_WEIGHT = 0.3;

// Market readiness is weighted strongly because validated demand is the clearest
// signal that the startup is solving a problem people will pay attention to.
const MARKET_WEIGHT = 0.25;

// Product readiness stays slightly below team/market because product maturity is
// important, but still easier to improve iteratively than team or market fit.
const PRODUCT_WEIGHT = 0.2;

// Traction matters as a differentiation signal, but early-stage startups can still
// be promising before they have large measured traction.
const TRACTION_WEIGHT = 0.15;

// Funding is included to capture runway and execution capacity, but it should not
// outweigh the core evidence of team, market, and product readiness.
const FUNDING_WEIGHT = 0.1;

type DimensionKey = 'team' | 'market' | 'product' | 'traction' | 'funding';

type ReadinessDimension = {
  key: DimensionKey;
  label: string;
  readinessType: ReadinessType;
  weight: number;
  rationale: string;
};

const READINESS_DIMENSIONS: ReadinessDimension[] = [
  {
    key: 'team',
    label: 'Team',
    readinessType: ReadinessType.A,
    weight: TEAM_WEIGHT,
    rationale: 'Team readiness is weighted highest because execution quality is the main multiplier for the rest of the startup.',
  },
  {
    key: 'market',
    label: 'Market',
    readinessType: ReadinessType.M,
    weight: MARKET_WEIGHT,
    rationale: 'Market readiness is critical because clear demand is the strongest proof that the opportunity is worth pursuing.',
  },
  {
    key: 'product',
    label: 'Product',
    readinessType: ReadinessType.T,
    weight: PRODUCT_WEIGHT,
    rationale: 'Product readiness is important, but it can move quickly once the team and market are clear.',
  },
  {
    key: 'traction',
    label: 'Traction',
    readinessType: ReadinessType.O,
    weight: TRACTION_WEIGHT,
    rationale: 'Traction differentiates the startup stage and validates momentum, but it should not overshadow fit signals.',
  },
  {
    key: 'funding',
    label: 'Funding',
    readinessType: ReadinessType.I,
    weight: FUNDING_WEIGHT,
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

  constructor(private readonly em: EntityManager) {}

  getWeightRationale() {
    return READINESS_DIMENSIONS.map((dimension) => ({
      key: dimension.key,
      label: dimension.label,
      weight: dimension.weight,
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

    const dimensions = READINESS_DIMENSIONS.map((dimension) => {
      const score = Math.max(0, Math.min(5, levelByType.get(dimension.readinessType) ?? 0));
      const percent = Math.round((score / 5) * 100);
      const weightedScore = Number(((percent / 100) * dimension.weight * 100).toFixed(2));

      return {
        key: dimension.key,
        label: dimension.label,
        readinessType: dimension.readinessType,
        score,
        percent,
        weight: dimension.weight,
        weightedScore,
        rationale: dimension.rationale,
      };
    });

    const compositeScore = Math.round(
      dimensions.reduce((total, dimension) => total + dimension.weightedScore, 0),
    );

    // Try to load persisted tier thresholds from the database; fall back to defaults
    const persisted = await this.em.find(TierConfig, {});
    const sortedTiers = persisted.sort((a, b) => b.threshold - a.threshold);

    let tierLabel = 'Early';
    let tierThreshold = 25;
    
    if (sortedTiers.length > 0) {
      // Fallback to lowest tier if score is below all thresholds
      tierLabel = sortedTiers[sortedTiers.length - 1].tierLabel;
      tierThreshold = sortedTiers[sortedTiers.length - 1].threshold;

      for (const tier of sortedTiers) {
        if (compositeScore >= tier.threshold) {
          tierLabel = tier.tierLabel;
          tierThreshold = tier.threshold;
          break;
        }
      }
    } else {
      tierLabel =
        compositeScore >= 85
          ? 'Strong'
          : compositeScore >= 70
            ? 'Ready'
            : compositeScore >= 55
              ? 'Emerging'
              : compositeScore >= 40
                ? 'Developing'
                : 'Early';
      tierThreshold = compositeScore >= 85 ? 85 : compositeScore >= 70 ? 70 : compositeScore >= 55 ? 55 : compositeScore >= 40 ? 40 : 25;
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
      weightRationale: this.getWeightRationale(),
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
