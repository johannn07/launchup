import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { AiConfigService } from './ai-config.service';
import { AiRunService } from './ai-run.service';

const configService = () =>
  new AiConfigService({ get: () => undefined } as unknown as ConfigService);

const emMock = () => {
  const persisted: any[] = [];
  const forkedEm = {
    nativeUpdate: jest.fn().mockResolvedValue(1),
  };
  return {
    persisted,
    forkedEm,
    create: jest.fn((_entity, data) => ({ ...data, id: 42 })),
    persistAndFlush: jest.fn(async (row) => {
      persisted.push(row);
    }),
    flush: jest.fn().mockResolvedValue(undefined),
    getReference: jest.fn((_e, id) => ({ id })),
    // `finish` writes through a forked EM (see ai-run.service.ts) rather
    // than flushing `this.em` directly, so tests observe the update via
    // `forkedEm.nativeUpdate` rather than `flush`.
    fork: jest.fn(function (this: any) {
      return this.forkedEm;
    }),
  };
};

describe('AiRunService', () => {
  it('opens a run recording the resolved config snapshot', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());

    const ctx = await service.begin(7, 'rns');

    expect(ctx.runId).toBe(42);
    expect(ctx.config.model).toBe('gemini-2.5-flash-lite');
    expect(em.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operation: 'rns',
        model: 'gemini-2.5-flash-lite',
        status: 'running',
        config: expect.objectContaining({ rag: true, grounding: true }),
      }),
    );
  });

  it('closes a successful run with latency and token counts', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(7, 'rna');

    await service.finish(ctx, {
      status: 'completed',
      latencyMs: 1234,
      promptTokens: 100,
      completionTokens: 200,
    });

    // In-memory reflection (best-effort, for callers/tests reading ctx.run).
    expect(ctx.run.status).toBe('completed');
    expect(ctx.run.latencyMs).toBe(1234);
    expect(ctx.run.promptTokens).toBe(100);
    expect(ctx.run.completedAt).toBeInstanceOf(Date);

    // The durable write goes through a forked EM via nativeUpdate, not
    // `this.em.flush()`.
    expect(em.fork).toHaveBeenCalled();
    expect(em.forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: ctx.runId },
      expect.objectContaining({
        status: 'completed',
        latencyMs: 1234,
        promptTokens: 100,
        completionTokens: 200,
      }),
    );
  });

  it('closes a failed run with the error message', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(7, 'roadblocks');

    await service.finish(ctx, { status: 'failed', latencyMs: 50, error: 'boom' });

    expect(ctx.run.status).toBe('failed');
    expect(ctx.run.error).toBe('boom');
    expect(em.forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: ctx.runId },
      expect.objectContaining({ status: 'failed', error: 'boom' }),
    );
  });

  it('exposes a frozen config', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(7, 'initiatives');

    expect(Object.isFrozen(ctx.config)).toBe(true);
  });

  it('finish never throws even when the bookkeeping write fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const em = emMock();
    em.forkedEm.nativeUpdate.mockRejectedValue(new Error('db connection lost'));
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(7, 'rna');

    await expect(
      service.finish(ctx, { status: 'completed', latencyMs: 10 }),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('AiRunService.track', () => {
  it('runs fn with a live ctx, marks the run completed, and returns fn\'s result', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());

    const result = await service.track(7, 'rns', undefined, false, async (ctx) => {
      expect(ctx.runId).toBe(42);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(em.forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 42 },
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('marks the run failed and rethrows the original error when fn throws', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());

    await expect(
      service.track(7, 'rns', undefined, false, async () => {
        throw new Error('domain failure');
      }),
    ).rejects.toThrow('domain failure');

    expect(em.forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 42 },
      expect.objectContaining({ status: 'failed', error: 'domain failure' }),
    );
  });

  // Property 1 from the review: a failure inside run bookkeeping must never
  // replace or mask the caller's real error. Simulate the bookkeeping write
  // itself failing (e.g. the DB connection that just caused the domain
  // failure is also unusable for the finish() call) and confirm the
  // *domain* error, not the bookkeeping error, is what reaches the caller.
  it('property 1: a bookkeeping failure never masks the original domain error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const em = emMock();
    em.forkedEm.nativeUpdate.mockRejectedValue(new Error('db connection lost'));
    const service = new AiRunService(em as unknown as EntityManager, configService());

    await expect(
      service.track(7, 'rns', undefined, false, async () => {
        throw new Error('domain failure: persistence error while generating RNS');
      }),
    ).rejects.toThrow('domain failure: persistence error while generating RNS');
    errorSpy.mockRestore();
  });
});
