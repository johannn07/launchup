import { EntityManager } from '@mikro-orm/core';
import { Injectable, Optional } from '@nestjs/common';
import { Sector } from 'src/entities/enums/sector.enum';
import { BusinessModel } from 'src/entities/enums/business-model.enum';
import { WeightProfile } from 'src/entities/weight-profile.entity';
import {
  DEFAULT_WEIGHTS,
  DIMENSION_KEYS,
  DimensionKey,
  WEIGHT_SUM_TOLERANCE,
} from './readiness.weights';
import { ConfigAlertService } from './config-alert.service';

@Injectable()
export class WeightProfileService {
  constructor(
    private readonly em: EntityManager,
    @Optional() private readonly alerts?: ConfigAlertService,
  ) {}

  async resolve(
    sector?: Sector | null,
    businessModel?: BusinessModel | null,
  ): Promise<Record<DimensionKey, number>> {
    const candidates: Array<{
      sector: Sector | null;
      businessModel: BusinessModel | null;
    }> = [];

    if (sector && businessModel) candidates.push({ sector, businessModel });
    if (sector) candidates.push({ sector, businessModel: null });
    candidates.push({ sector: null, businessModel: null });

    for (const where of candidates) {
      const profile = await this.em.findOne(WeightProfile, where);
      if (!profile) continue;

      const weights = await this.validate(profile);
      if (weights) return weights;
    }

    // The table is empty on any unseeded database. Returning zeros here would
    // be a silent scoring failure, so the constants are the floor.
    return DEFAULT_WEIGHTS;
  }

  private async validate(
    profile: WeightProfile,
  ): Promise<Record<DimensionKey, number> | null> {
    const stored = profile.weights ?? {};

    const missing = DIMENSION_KEYS.filter((key) => typeof stored[key] !== 'number');
    if (missing.length > 0) {
      await this.alerts?.raise(
        `Weight profile ${profile.id} is missing ${missing.join(', ')}; using the next profile in the cascade.`,
      );
      return null;
    }

    const sum = DIMENSION_KEYS.reduce((total, key) => total + stored[key], 0);
    if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
      await this.alerts?.raise(
        `Weight profile ${profile.id} sums to ${sum.toFixed(3)}, not 1.0; using the next profile in the cascade.`,
      );
      return null;
    }

    return Object.fromEntries(
      DIMENSION_KEYS.map((key) => [key, stored[key]]),
    ) as Record<DimensionKey, number>;
  }
}
