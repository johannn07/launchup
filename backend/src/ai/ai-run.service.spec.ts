import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import { AiConfigService } from './ai-config.service';
import { AiRunService } from './ai-run.service';

const configService = () =>
  new AiConfigService({ get: () => undefined } as unknown as ConfigService);

const emMock = () => {
  const persisted: any[] = [];
  return {
    persisted,
    create: jest.fn((_entity, data) => ({ ...data, id: 42 })),
    persistAndFlush: jest.fn(async (row) => {
      persisted.push(row);
    }),
    flush: jest.fn().mockResolvedValue(undefined),
    getReference: jest.fn((_e, id) => ({ id })),
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

    expect(ctx.run.status).toBe('completed');
    expect(ctx.run.latencyMs).toBe(1234);
    expect(ctx.run.promptTokens).toBe(100);
    expect(ctx.run.completedAt).toBeInstanceOf(Date);
    expect(em.flush).toHaveBeenCalled();
  });

  it('closes a failed run with the error message', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(7, 'roadblocks');

    await service.finish(ctx, { status: 'failed', latencyMs: 50, error: 'boom' });

    expect(ctx.run.status).toBe('failed');
    expect(ctx.run.error).toBe('boom');
  });

  it('exposes a frozen config', async () => {
    const em = emMock();
    const service = new AiRunService(em as unknown as EntityManager, configService());
    const ctx = await service.begin(7, 'initiatives');

    expect(Object.isFrozen(ctx.config)).toBe(true);
  });
});
