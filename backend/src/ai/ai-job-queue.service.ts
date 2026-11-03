import { createHash } from 'crypto';
import { EntityManager, RequestContext } from '@mikro-orm/core';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiGenerationJob,
  AiJobOperation,
} from 'src/entities/ai-generation-job.entity';
import { Startup } from 'src/entities/startup.entity';
import { AiQuotaService } from './ai-quota.service';
import { AiRunContext, AiRunService } from './ai-run.service';
import { nextAttemptAt, queuedMessage, refusalOf } from './job-retry-schedule';

export interface QueuedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

type Handler = (
  payload: Record<string, unknown>,
  ctx: AiRunContext,
  file: QueuedFile | null,
) => Promise<unknown>;

interface Registration {
  handler: Handler;
  /** Store the return value on the job: a parse has nowhere else to go. */
  keepResult: boolean;
}

export interface QueueRequest {
  operation: AiJobOperation;
  startupId?: number | null;
  /** For requests that only name the startup indirectly (initiatives). */
  resolveStartupId?: () => Promise<number | null>;
  payload: Record<string, unknown>;
  user?: { id?: number; email?: string } | null;
  /** An upload to replay (SRS 2.4); kept in the job row until it ends. */
  file?: QueuedFile;
}

const TICK_MS = 60_000;

/**
 * SRS 2.2: generation Gemini refuses is queued and retried, rather than lost.
 * One job runs at a time, so a backlog cannot burn the daily quota at once.
 */
@Injectable()
export class AiJobQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiJobQueueService.name);
  private readonly handlers = new Map<AiJobOperation, Registration>();
  private timer?: NodeJS.Timeout;
  private busy = false;

  constructor(
    private readonly em: EntityManager,
    private readonly runs: AiRunService,
    private readonly quota: AiQuotaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    if (
      process.env.NODE_ENV === 'test' ||
      this.config.get('AI_JOB_QUEUE_ENABLED') === 'false'
    )
      return;
    // A restart mid-run leaves a job 'running' forever otherwise.
    await this.em
      .fork()
      .nativeUpdate(
        AiGenerationJob,
        { status: 'running' },
        { status: 'queued', nextAttemptAt: new Date() },
      );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Called by each generating controller for its own operation. */
  register(
    operation: AiJobOperation,
    handler: Handler,
    { keepResult = false }: { keepResult?: boolean } = {},
  ) {
    this.handlers.set(operation, { handler, keepResult });
  }

  /** Runs now; on a Gemini refusal, queues the request and says so. */
  async runOrQueue<T>(
    request: QueueRequest,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (e) {
      const refusal = refusalOf(e);
      if (!refusal) throw e;
      const job = await this.enqueue(request, refusal);
      throw new ServiceUnavailableException(
        {
          statusCode: 503,
          error: 'Service Unavailable',
          message: queuedMessage(refusal),
          queued: true,
          jobId: job.id,
          nextAttemptAt: job.nextAttemptAt,
        },
        { cause: e },
      );
    }
  }

  private async enqueue(request: QueueRequest, refusal: unknown) {
    const em = this.em.fork();
    const startupId =
      request.startupId ?? (await request.resolveStartupId?.()) ?? null;
    const { resetAt } = await this.quota.status();
    const when = nextAttemptAt(refusal, 1, new Date(), resetAt)!;

    // The same upload twice is one job; its hash stands in for the bytes.
    const payload = request.file
      ? {
          ...request.payload,
          sha256: createHash('sha256')
            .update(request.file.buffer)
            .digest('hex'),
        }
      : request.payload;

    // Pressing Generate twice while Gemini is down queues it once.
    const same = await em.find(AiGenerationJob, {
      operation: request.operation,
      startup: startupId,
      requestedById: request.user?.id ?? null,
      status: 'queued',
    });
    const payloadKey = JSON.stringify(payload);
    const existing = same.find((j) => JSON.stringify(j.payload) === payloadKey);
    if (existing) return existing;

    const job = em.create(AiGenerationJob, {
      operation: request.operation,
      startup: startupId ? em.getReference(Startup, startupId) : null,
      payload,
      file: request.file?.buffer ?? null,
      fileName: request.file?.originalname ?? null,
      mimeType: request.file?.mimetype ?? null,
      requestedById: request.user?.id ?? null,
      requestedByEmail: request.user?.email ?? null,
      status: 'queued',
      attempts: 0,
      nextAttemptAt: when,
      lastError: queuedMessage(refusal),
      createdAt: new Date(),
    });
    await em.persistAndFlush(job);
    return job;
  }

  /** Runs the next due job, if any. Public for tests. */
  async tick(now = new Date()) {
    if (this.busy) return;
    this.busy = true;
    try {
      const em = this.em.fork();
      const job = await em.findOne(
        AiGenerationJob,
        { status: 'queued', nextAttemptAt: { $lte: now } },
        { orderBy: { nextAttemptAt: 'ASC' }, populate: ['file'] },
      );
      if (!job) return;

      const quota = await this.quota.status(now);
      if (quota.exhausted) {
        job.nextAttemptAt = new Date(quota.resetAt.getTime() + 2 * 60_000);
        await em.flush();
        return;
      }

      const registration = this.handlers.get(job.operation);
      if (!registration) {
        job.status = 'failed';
        job.lastError = `No handler registered for ${job.operation}.`;
        await em.flush();
        return;
      }

      job.status = 'running';
      job.attempts += 1;
      await em.flush();

      const file: QueuedFile | null = job.file
        ? {
            buffer: Buffer.from(job.file),
            originalname: job.fileName ?? 'upload',
            mimetype: job.mimeType ?? 'application/octet-stream',
          }
        : null;

      try {
        const result = await RequestContext.create(this.em, () =>
          this.runs.track(
            job.startup?.id ?? null,
            job.operation,
            undefined,
            false,
            (ctx) => registration.handler(job.payload, ctx, file),
          ),
        );
        job.status = 'completed';
        job.completedAt = new Date();
        job.lastError = null;
        job.file = null;
        if (registration.keepResult) job.result = result;
      } catch (e) {
        const refusal = refusalOf(e);
        const next = refusal
          ? nextAttemptAt(refusal, job.attempts, new Date(), quota.resetAt)
          : null;
        job.status = next ? 'queued' : 'failed';
        if (next) job.nextAttemptAt = next;
        else job.file = null;
        job.lastError = refusal
          ? queuedMessage(refusal)
          : e instanceof Error
            ? e.message
            : String(e);
        this.logger.warn(
          `Job ${job.id} (${job.operation}) attempt ${job.attempts}: ${job.status}`,
        );
      }
      await em.flush();
    } catch (e) {
      this.logger.error(
        `Queue tick failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.busy = false;
    }
  }

  async listForStartup(startupId: number) {
    return this.em.fork().find(
      AiGenerationJob,
      {
        startup: startupId,
        status: { $in: ['queued', 'running', 'failed'] },
      },
      { orderBy: { createdAt: 'DESC' }, limit: 20 },
    );
  }

  /** A user's own startup-less jobs, e.g. proposal parses before a startup exists. */
  async listMine(userId: number, operation: AiJobOperation) {
    return this.em.fork().find(
      AiGenerationJob,
      {
        requestedById: userId,
        operation,
        status: { $in: ['queued', 'running', 'failed', 'completed'] },
      },
      { orderBy: { createdAt: 'DESC' }, limit: 5 },
    );
  }

  /** Hands a finished result to its requester once. */
  async collect(id: number) {
    const em = this.em.fork();
    const job = await em.findOneOrFail(AiGenerationJob, { id });
    if (job.status === 'completed') {
      job.status = 'collected';
      await em.flush();
    }
    return job;
  }

  async findOne(id: number) {
    return this.em.fork().findOne(AiGenerationJob, { id });
  }

  /** Queued or failed jobs only; a running one is already spending quota. */
  async cancel(id: number) {
    const em = this.em.fork();
    const job = await em.findOneOrFail(AiGenerationJob, { id });
    if (job.status === 'queued' || job.status === 'failed') {
      job.status = 'cancelled';
      await em.flush();
      // `file` is lazy and unloaded here, so assigning null would not be flushed.
      await em.nativeUpdate(AiGenerationJob, { id }, { file: null });
    }
    return job;
  }
}
