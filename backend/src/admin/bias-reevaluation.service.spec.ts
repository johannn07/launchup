import { EntityManager } from '@mikro-orm/core';
import { NotFoundException } from '@nestjs/common';
import { AiService } from 'src/ai/ai.service';
import { AiRunService } from 'src/ai/ai-run.service';
import { BiasReevaluationService } from './bias-reevaluation.service';

// SRS 2.1: a Manager may request a re-evaluation of an audited score.
describe('BiasReevaluationService', () => {
  const build = (original: Record<string, unknown> | null) => {
    const em = {
      findOne: jest.fn().mockResolvedValue(original),
      findOneOrFail: jest.fn().mockResolvedValue({ id: 99 }),
      create: jest.fn((_e: unknown, data: unknown) => data),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
    };
    const ai = {
      reviewBiasScore: jest.fn().mockResolvedValue({
        correctedScore: 6,
        biasFlagged: true,
        justification: 'Inflated.',
        reviewFailed: false,
      }),
      recordBiasAudit: jest.fn().mockResolvedValue({ id: 99 }),
    };
    const runs = {
      track: jest.fn(
        (
          _s: unknown,
          _o: unknown,
          _h: unknown,
          _p: unknown,
          fn: (ctx: unknown) => unknown,
        ) => fn({ run: { id: 7 } }),
      ),
    };
    const service = new BiasReevaluationService(
      em as unknown as EntityManager,
      ai as unknown as AiService,
      runs as unknown as AiRunService,
    );
    return { service, em, ai, runs };
  };

  const ORIGINAL = {
    id: 82,
    startup: { id: 2, name: 'MediSync' },
    dimensionKey: 'Technology',
    rawScore: 8,
    threshold: 2,
    reviewContext: 'Startup: MediSync\nTask description: Pilot',
  };

  it('reruns the review with the stored context and records a linked audit', async () => {
    const { service, ai, runs } = build(ORIGINAL);

    await service.reevaluate(82, 'manager@launchup.local');

    expect(runs.track).toHaveBeenCalledWith(
      2,
      'bias_reevaluation',
      undefined,
      true,
      expect.any(Function),
    );
    expect(ai.reviewBiasScore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rawScore: 8,
        maxScore: 9,
        context: ORIGINAL.reviewContext,
      }),
    );
    expect(ai.recordBiasAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        reevaluationOf: 82,
        correctedScore: 6,
        deviation: 2,
        biasStatus: 'flagged',
        justification: 'Inflated.',
        generationRun: { id: 7 },
      }),
    );
  });

  it('says so when the original context was not stored', async () => {
    const { service, ai } = build({ ...ORIGINAL, reviewContext: null });

    await service.reevaluate(82, 'm');

    expect(ai.reviewBiasScore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        context: 'Startup: MediSync\nDimension: Technology',
      }),
    );
    expect(ai.recordBiasAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        justification: expect.stringContaining(
          'original context was not stored',
        ),
      }),
    );
  });

  it('uses the 1-5 scale for roadblock risk', async () => {
    const { service, ai } = build({ ...ORIGINAL, dimensionKey: 'roadblock' });
    await service.reevaluate(82, 'm');
    expect(ai.reviewBiasScore).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ maxScore: 5 }),
    );
  });

  it('404s on an unknown audit', async () => {
    const { service } = build(null);
    await expect(service.reevaluate(1, 'm')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
