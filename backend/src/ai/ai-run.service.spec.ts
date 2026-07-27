import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { AiConfigService } from './ai-config.service';
import { AiRunService } from './ai-run.service';
import { AiService } from './ai.service';
import { AiMetricsService } from './ai-metrics.service';
import { BaselineService } from './baseline.service';
import { EmbeddingIndexService } from './embedding-index.service';
import { EmbeddingService } from './embedding.service';

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
    // configService() has no env set, so this is DEFAULT_MODEL.
    expect(ctx.config.model).toBe('gemini-3.6-flash');
    expect(em.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        operation: 'rns',
        model: 'gemini-3.6-flash',
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

  // Ledger minor #7: the startupId=null branch of begin() had no coverage.
  // It is the branch every refine route and generate-initiatives takes, and
  // it is exactly why attribute() has to exist.
  it('opens a run with no startup when startupId is null', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());

    const ctx = await service.begin(null, 'roadblocks_refine');

    expect(em.getReference).not.toHaveBeenCalled();
    expect(em.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ startup: undefined, operation: 'roadblocks_refine' }),
    );
    expect(ctx.run.startup).toBeUndefined();
  });

  it('exposes a frozen config', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(7, 'initiatives');

    expect(Object.isFrozen(ctx.config)).toBe(true);
  });

  it('attribute writes the startup through the forked EM, not just onto ctx.run', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(null, 'roadblocks_refine');
    const startup = { id: 9, name: 'AgroLink' } as any;

    await service.attribute(ctx, startup);

    // In-memory view stays accurate...
    expect(ctx.run.startup).toBe(startup);
    // ...but the assertion that actually matters is the durable write.
    // `finish`'s payload never includes `startup`, so without this the row
    // would only ever be corrected by an unrelated later flush.
    expect(em.forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: ctx.runId },
      { startup: 9 },
    );
  });

  it('attribute never throws when the bookkeeping write fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const em = emMock();
    em.forkedEm.nativeUpdate.mockRejectedValue(new Error('db connection lost'));
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(null, 'rna_refine');

    await expect(
      service.attribute(ctx, { id: 9 } as any),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
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

  // The exact scenario the durable-attribution fix exists for: a refine
  // handler attributes the run and then the model call blows up. Nothing
  // flushes the request-context EM on this path, so a bare
  // `ctx.run.startup = startup` would be discarded and the row would land
  // status='failed' with startup_id NULL — invisible to the startup-filtered
  // provenance query the table exists to serve.
  it('keeps the startup attribution in the database when the tracked work throws', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const startup = { id: 30 } as any;

    await expect(
      service.track(null, 'roadblocks_refine', undefined, false, async (ctx) => {
        await service.attribute(ctx, startup);
        throw new Error('AI returned an invalid JSON response');
      }),
    ).rejects.toThrow('AI returned an invalid JSON response');

    expect(em.forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 42 },
      { startup: 30 },
    );
    expect(em.forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 42 },
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('leaves token columns unset when no response carried usage metadata', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());

    await service.track(7, 'rns', undefined, false, async () => 'ok');

    const update = em.forkedEm.nativeUpdate.mock.calls.at(-1)![2];
    expect(update).not.toHaveProperty('promptTokens');
    expect(update).not.toHaveProperty('completionTokens');
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

// Token accounting is only meaningful end to end: AiService.generate folds
// each response's usageMetadata into ctx.tokens, and track() writes the
// total. Wiring a real AiService to a real AiRunService is what proves the
// two halves actually meet — a unit test of either alone would not.
describe('AiRunService token accounting', () => {
  const buildAiService = (generateContent: jest.Mock) => {
    const service = new AiService(
      { get: jest.fn() } as unknown as ConfigService,
      { recordFailure: jest.fn().mockResolvedValue(undefined) } as unknown as AiMetricsService,
      { normalizeScore: jest.fn() } as unknown as BaselineService,
      {} as unknown as EntityManager,
      configService(),
      // Only reached via recordRagContext, which token accounting never calls.
      { indexRagContext: jest.fn() } as unknown as EmbeddingIndexService,
      { embed: jest.fn() } as unknown as EmbeddingService,
    );
    (service as unknown as { ai: unknown }).ai = { models: { generateContent } };
    return service;
  };

  // callAiExpectJson retries once on unparseable output, so a single run
  // routinely makes two model calls. Recording only the last call's usage
  // would under-report the run's real Gemini spend.
  it('records the sum of every model call in the run, not just the last one', async () => {
    const em = emMock();
    const runService = new AiRunService(em as unknown as EntityManager, configService());
    const generateContent = jest
      .fn()
      .mockResolvedValueOnce({
        text: 'not json',
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      })
      .mockResolvedValueOnce({
        text: '[{"readiness_level_type":"Technology","rna":"Ship a prototype"}]',
        usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
      });
    const aiService = buildAiService(generateContent);

    await runService.track(7, 'rna', undefined, false, (ctx) =>
      aiService.generateRNAsFromPrompt(ctx, 'prompt'),
    );

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(em.forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 42 },
      expect.objectContaining({
        status: 'completed',
        promptTokens: 22, // 10 + 12, not 12
        completionTokens: 12, // 5 + 7, not 7
      }),
    );
  });

  it('does not throw when a response omits usageMetadata', async () => {
    const em = emMock();
    const runService = new AiRunService(em as unknown as EntityManager, configService());
    const generateContent = jest.fn().mockResolvedValue({
      text: '[{"readiness_level_type":"Technology","rna":"Ship a prototype"}]',
    });
    const aiService = buildAiService(generateContent);

    await expect(
      runService.track(7, 'rna', undefined, false, (ctx) =>
        aiService.generateRNAsFromPrompt(ctx, 'prompt'),
      ),
    ).resolves.toHaveLength(1);

    const update = em.forkedEm.nativeUpdate.mock.calls.at(-1)![2];
    expect(update).not.toHaveProperty('promptTokens');
  });
});
