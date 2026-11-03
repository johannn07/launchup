import { EntityManager } from '@mikro-orm/core';
import { ActivityLog } from 'src/entities/activity-log.entity';
import { ReadinessType } from 'src/entities/enums/readiness-type.enum';
import {
  CONFIG_ALERT_ACTION,
  ConfigAlertService,
} from './config-alert.service';
import { ReadinessService } from './readiness.service';
import { DEFAULT_WEIGHTS } from './readiness.weights';
import { WeightProfileService } from './weight-profile.service';

// SRS 2.3: invalid weight or tier configuration raises an administrator alert.
function alertEm() {
  const flushed: unknown[] = [];
  const fork = {
    persistAndFlush: jest.fn(async (row) => void flushed.push(row)),
  };
  const em = {
    fork: () => fork,
    create: jest.fn((_e, data) => data),
  } as unknown as EntityManager;
  return { em, flushed, create: em.create as jest.Mock };
}

describe('ConfigAlertService', () => {
  it('writes one Config alert row per distinct problem', async () => {
    const { em, flushed, create } = alertEm();
    const alerts = new ConfigAlertService(em);

    await alerts.raise('Weight profile 9 sums to 0.800');
    await alerts.raise('Weight profile 9 sums to 0.800');
    await alerts.raise('Weight profile 4 sums to 1.200');

    expect(flushed).toHaveLength(2);
    expect(create).toHaveBeenCalledWith(
      ActivityLog,
      expect.objectContaining({ action: CONFIG_ALERT_ACTION, actor: 'system' }),
    );
  });

  it('retries a problem whose alert could not be written', async () => {
    const { em } = alertEm();
    const fork = em.fork() as unknown as { persistAndFlush: jest.Mock };
    fork.persistAndFlush.mockRejectedValueOnce(new Error('db down'));
    const alerts = new ConfigAlertService(em);

    await alerts.raise('x');
    await alerts.raise('x');

    expect(fork.persistAndFlush).toHaveBeenCalledTimes(2);
  });
});

describe('Invalid configuration alerts', () => {
  const raise = jest.fn().mockResolvedValue(undefined);
  const alerts = { raise } as unknown as ConfigAlertService;
  beforeEach(() => raise.mockClear());

  it('alerts on a weight profile that does not sum to 1', async () => {
    const broken = {
      id: 9,
      sector: null,
      businessModel: null,
      weights: { ...DEFAULT_WEIGHTS, team: 0.1 },
    };
    const em = {
      findOne: jest.fn().mockResolvedValue(broken),
    } as unknown as EntityManager;

    const weights = await new WeightProfileService(em, alerts).resolve(
      null,
      null,
    );

    expect(weights).toEqual(DEFAULT_WEIGHTS);
    expect(raise).toHaveBeenCalledWith(
      expect.stringContaining('Weight profile 9 sums to'),
    );
  });

  const scoringEm = (tiers: Array<{ tierLabel: string; threshold: number }>) =>
    ({
      find: jest.fn(async (entity: { name?: string }) =>
        entity?.name === 'TierConfig'
          ? tiers
          : [{ readinessLevel: { level: 5, readinessType: ReadinessType.T } }],
      ),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(() => ({})),
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    }) as unknown as EntityManager;
  const profiles = {
    resolve: jest.fn().mockResolvedValue(DEFAULT_WEIGHTS),
  } as unknown as WeightProfileService;

  it('skips unusable tier rows and alerts', async () => {
    const em = scoringEm([
      { tierLabel: 'Top', threshold: 150 },
      { tierLabel: 'Base', threshold: 0 },
    ]);

    const result = await new ReadinessService(
      em,
      profiles,
      alerts,
    ).getReadinessForStartup(1);

    expect(result.tierLabel).toBe('Base');
    expect(raise).toHaveBeenCalledWith(expect.stringContaining('"Top" at 150'));
  });

  it('falls back to the default tiers when no row is usable', async () => {
    const em = scoringEm([{ tierLabel: ' ', threshold: 50 }]);

    const result = await new ReadinessService(
      em,
      profiles,
      alerts,
    ).getReadinessForStartup(1);

    expect(result.tierLabel).toBe('Early');
    expect(raise).toHaveBeenCalledWith(
      expect.stringContaining('the default tiers are used'),
    );
  });

  it('stays quiet on a valid tier set', async () => {
    const em = scoringEm([{ tierLabel: 'Only', threshold: 10 }]);
    await new ReadinessService(em, profiles, alerts).getReadinessForStartup(1);
    expect(raise).not.toHaveBeenCalled();
  });
});
