import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { AiConfigService } from './ai-config.service';
import { AiPipelineConfig } from './ai-config.types';
import {
  AiGenerationRun,
  AiRunOperation,
} from '../entities/ai-generation-run.entity';
import { Startup } from '../entities/startup.entity';

/** Immutable handle carried through one generation call. */
export interface AiRunContext {
  readonly config: AiPipelineConfig;
  readonly runId: number;
  readonly run: AiGenerationRun;
}

export type AiRunOutcome =
  | {
      status: 'completed';
      latencyMs: number;
      promptTokens?: number;
      completionTokens?: number;
    }
  | { status: 'failed'; latencyMs: number; error: string };

@Injectable()
export class AiRunService {
  constructor(
    private readonly em: EntityManager,
    private readonly aiConfig: AiConfigService,
  ) {}

  async begin(
    startupId: number | null,
    operation: AiRunOperation,
    rawHeader?: string,
    isPrivileged = false,
  ): Promise<AiRunContext> {
    const config = this.aiConfig.resolve(rawHeader, isPrivileged);

    const run = this.em.create(AiGenerationRun, {
      startup: startupId ? this.em.getReference(Startup, startupId) : undefined,
      operation,
      model: config.model,
      config: { ...config },
      status: 'running',
      createdAt: new Date(),
    });

    await this.em.persistAndFlush(run);

    return { config, runId: run.id, run };
  }

  async finish(ctx: AiRunContext, outcome: AiRunOutcome): Promise<void> {
    const update: Partial<AiGenerationRun> = {
      status: outcome.status,
      latencyMs: outcome.latencyMs,
      completedAt: new Date(),
    };

    if (outcome.status === 'completed') {
      update.promptTokens = outcome.promptTokens;
      update.completionTokens = outcome.completionTokens;
    } else {
      update.error = outcome.error;
    }

    // Best-effort in-memory reflection for callers/tests that read `ctx.run`
    // directly. This must never throw.
    try {
      Object.assign(ctx.run, update);
    } catch {
      /* ctx.run is not assignable for some reason; the DB write below is
       * what actually matters, so keep going. */
    }

    try {
      // Write through a forked EM rather than flushing `this.em` directly.
      // `finish` is very often called from a catch block reacting to a
      // failure that happened *on this same EntityManager* (e.g. a flush
      // error mid-generation) — that unit of work can be in a state where
      // it can no longer be flushed. A fork is an independent EM/connection,
      // and `nativeUpdate` bypasses the identity map entirely, so this
      // write does not depend on `this.em`'s current state at all. That is
      // what lets a failed run reliably land at status: 'failed' instead of
      // being stranded at 'running'.
      await this.em.fork().nativeUpdate(AiGenerationRun, { id: ctx.runId }, update);
    } catch (bookkeepingError) {
      // Run bookkeeping must never mask or replace the caller's real error.
      // Swallow and log; the caller (see `track`) is already propagating
      // whatever error caused this outcome, or has already returned
      // successfully and shouldn't have that undone by a logging failure.
      console.error(
        `AiRunService.finish: failed to persist outcome for run ${ctx.runId}`,
        bookkeepingError,
      );
    }
  }

  /**
   * Runs `fn` inside a begin/finish pair: opens a run, times `fn`, marks the
   * run completed on success or failed on throw, and rethrows the original
   * error unchanged. This is the intended way for controllers to use
   * begin/finish — `begin` and `finish` stay public because they are
   * independently tested and because a handful of call sites may still need
   * them separately, but `track` is what new call sites should reach for.
   */
  async track<T>(
    startupId: number | null,
    operation: AiRunOperation,
    rawHeader: string | undefined,
    isPrivileged: boolean,
    fn: (ctx: AiRunContext) => Promise<T>,
  ): Promise<T> {
    const ctx = await this.begin(startupId, operation, rawHeader, isPrivileged);
    const startedAt = Date.now();

    try {
      const result = await fn(ctx);
      await this.finish(ctx, {
        status: 'completed',
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      await this.finish(ctx, {
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
