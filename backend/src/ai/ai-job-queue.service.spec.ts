import { EntityManager } from '@mikro-orm/core';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiJobQueueService } from './ai-job-queue.service';
import { AiQuotaService } from './ai-quota.service';
import { AiRunService } from './ai-run.service';
import {
  MAX_JOB_ATTEMPTS,
  nextAttemptAt,
  refusalOf,
} from './job-retry-schedule';

// SRS 2.2: failed generation requests are queued for retry.
const BUSY = new Error('503 Service Unavailable: UNAVAILABLE');
const DAILY = new Error('429 Too Many Requests: RESOURCE_EXHAUSTED');
const PER_MINUTE = new Error(
  '429 RESOURCE_EXHAUSTED GenerateRequestsPerMinutePerProjectPerModel',
);
const wrapped = (cause: Error) =>
  new ServiceUnavailableException('busy', { cause });

const NOW = new Date('2026-11-03T02:00:00Z');
const RESET = new Date('2026-11-03T08:00:00Z');
const minutesAfterNow = (d: Date | null) =>
  d ? (d.getTime() - NOW.getTime()) / 60_000 : null;

describe('job retry schedule', () => {
  it('recognises a refusal directly or wrapped by withAiRetry', () => {
    expect(refusalOf(BUSY)).toBe(BUSY);
    expect(refusalOf(wrapped(DAILY))).toBe(DAILY);
    expect(refusalOf(new BadRequestException('No capsule'))).toBeNull();
  });

  it('backs off a busy model, waits for the reset on the daily cap', () => {
    expect(minutesAfterNow(nextAttemptAt(BUSY, 1, NOW, RESET))).toBe(2);
    expect(minutesAfterNow(nextAttemptAt(BUSY, 3, NOW, RESET))).toBe(15);
    expect(minutesAfterNow(nextAttemptAt(PER_MINUTE, 3, NOW, RESET))).toBe(2);
    expect(nextAttemptAt(DAILY, 1, NOW, RESET)?.toISOString()).toBe(
      '2026-11-03T08:02:00.000Z',
    );
  });

  it('gives up after the last attempt', () => {
    expect(nextAttemptAt(BUSY, MAX_JOB_ATTEMPTS, NOW, RESET)).toBeNull();
  });
});

describe('AiJobQueueService', () => {
  function build(rows: any[] = []) {
    const fork = {
      find: jest.fn((_e: unknown, where: any) =>
        Promise.resolve(
          rows.filter(
            (r) => r.operation === where.operation && r.status === 'queued',
          ),
        ),
      ),
      findOne: jest.fn(() =>
        Promise.resolve(rows.find((r) => r.status === 'queued') ?? null),
      ),
      create: jest.fn((_e: unknown, data: any) => ({ id: 1, ...data })),
      getReference: jest.fn((_e: unknown, id: number) => ({ id })),
      persistAndFlush: jest.fn((job: any) => {
        rows.push(job);
        return Promise.resolve();
      }),
      flush: jest.fn(() => Promise.resolve()),
    };
    const em = { fork: () => fork } as unknown as EntityManager;
    const runs = {
      track: jest.fn(
        (
          _s: unknown,
          _o: unknown,
          _h: unknown,
          _p: unknown,
          fn: (c: unknown) => unknown,
        ) => fn({}),
      ),
    };
    const quota = {
      status: jest.fn(() =>
        Promise.resolve({ exhausted: false, resetAt: RESET }),
      ),
    };
    const service = new AiJobQueueService(
      em,
      runs as unknown as AiRunService,
      quota as unknown as AiQuotaService,
      { get: () => undefined } as unknown as ConfigService,
    );
    return { service, rows, quota };
  }

  const request = {
    operation: 'rna' as const,
    startupId: 2,
    payload: { startupId: 2, readinessTypes: ['Market'] },
    user: { id: 5, email: 'mentor@x.test' },
  };

  it('passes a successful result straight through', async () => {
    const { service, rows } = build();
    await expect(
      service.runOrQueue(request, () => Promise.resolve('ok')),
    ).resolves.toBe('ok');
    expect(rows).toHaveLength(0);
  });

  it('queues a refused request once and tells the caller', async () => {
    const { service, rows } = build();
    const fail = () => Promise.reject(wrapped(BUSY));

    const first = service.runOrQueue(request, fail);
    await expect(first).rejects.toBeInstanceOf(ServiceUnavailableException);
    await first.catch((e: ServiceUnavailableException) =>
      expect(e.getResponse()).toMatchObject({ queued: true, jobId: 1 }),
    );
    await expect(service.runOrQueue(request, fail)).rejects.toBeTruthy();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operation: 'rna',
      status: 'queued',
      attempts: 0,
      requestedByEmail: 'mentor@x.test',
    });
  });

  it('does not queue errors a retry cannot fix', async () => {
    const { service, rows } = build();
    await expect(
      service.runOrQueue(request, () =>
        Promise.reject(new BadRequestException('No capsule proposal')),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(0);
  });

  const due = () => ({
    id: 1,
    operation: 'rna',
    startup: { id: 2 },
    payload: { startupId: 2 },
    status: 'queued',
    attempts: 0,
    nextAttemptAt: NOW,
  });

  it('runs a due job with its registered handler', async () => {
    const job = due();
    const { service } = build([job]);
    const handler = jest.fn(() => Promise.resolve([]));
    service.register('rna', handler);

    await service.tick(NOW);

    expect(handler).toHaveBeenCalledWith({ startupId: 2 }, {});
    expect(job).toMatchObject({ status: 'completed', attempts: 1 });
  });

  it('requeues on another refusal and fails on any other error', async () => {
    const refused = due();
    const a = build([refused]);
    a.service.register('rna', () => Promise.reject(wrapped(DAILY)));
    await a.service.tick(NOW);
    expect(refused.status).toBe('queued');
    expect(refused.nextAttemptAt.toISOString()).toBe(
      '2026-11-03T08:02:00.000Z',
    );

    const broken = due();
    const b = build([broken]);
    b.service.register('rna', () =>
      Promise.reject(new BadRequestException('No capsule proposal')),
    );
    await b.service.tick(NOW);
    expect(broken).toMatchObject({
      status: 'failed',
      lastError: 'No capsule proposal',
    });
  });

  it('spends nothing while the daily quota is exhausted', async () => {
    const job = due();
    const { service, quota } = build([job]);
    quota.status.mockResolvedValue({ exhausted: true, resetAt: RESET });
    const handler = jest.fn();
    service.register('rna', handler);

    await service.tick(NOW);

    expect(handler).not.toHaveBeenCalled();
    expect(job.attempts).toBe(0);
    expect(job.nextAttemptAt.toISOString()).toBe('2026-11-03T08:02:00.000Z');
  });
});
