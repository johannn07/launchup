import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { AiConfigService } from './ai-config.service';
import { AiPipelineConfig } from './ai-config.types';
import {
  AiGenerationRun,
  AiRunOperation,
} from '../entities/ai-generation-run.entity';
import { Startup } from '../entities/startup.entity';

/**
 * Running total of Gemini token spend for one run.
 *
 * Accumulates because a run makes several calls — `callAiExpectJson` retries,
 * batch generation loops. Recording only the last would under-report cost.
 *
 * `recorded` separates "model reported zero" from "no response carried
 * usageMetadata", so the latter leaves the columns NULL rather than a fake 0.
 */
export interface AiRunTokenTotals {
  promptTokens: number;
  completionTokens: number;
  recorded: boolean;
}

/**
 * Handle carried through one generation call. `tokens` is deliberately mutable
 * — AiService's generation chokepoint adds into it on every model call.
 */
export interface AiRunContext {
  readonly config: AiPipelineConfig;
  readonly runId: number;
  readonly run: AiGenerationRun;
  readonly tokens: AiRunTokenTotals;
}

export type AiRunOutcome =
  | {
      status: 'completed';
      latencyMs: number;
      promptTokens?: number;
      completionTokens?: number;
    }
  | {
      status: 'failed';
      latencyMs: number;
      error: string;
      promptTokens?: number;
      completionTokens?: number;
    };

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

    return {
      config,
      runId: run.id,
      run,
      tokens: { promptTokens: 0, completionTokens: 0, recorded: false },
    };
  }

  /**
   * Durably attributes an already-open run to a startup. Several operations
   * open their run before the startup id is known and backfill it later.
   *
   * Needs its own forked write: assigning `ctx.run.startup` alone is discarded
   * on the failure path, because `finish` writes a fixed payload that omits
   * `startup` and nothing else flushes the request EM. Failed runs are exactly
   * what a startup-filtered provenance query most needs to surface.
   *
   * Must never throw — bookkeeping cannot replace the caller's real work.
   */
  async attribute(ctx: AiRunContext, startup: Startup): Promise<void> {
    // Keep the in-memory view accurate for callers that read ctx.run.
    ctx.run.startup = startup;

    try {
      await this.em
        .fork()
        .nativeUpdate(AiGenerationRun, { id: ctx.runId }, { startup: startup.id });
    } catch (bookkeepingError) {
      console.error(
        `AiRunService.attribute: failed to persist startup attribution for run ${ctx.runId}`,
        bookkeepingError,
      );
    }
  }

  async finish(ctx: AiRunContext, outcome: AiRunOutcome): Promise<void> {
    const update: Partial<AiGenerationRun> = {
      status: outcome.status,
      latencyMs: outcome.latencyMs,
      completedAt: new Date(),
    };

    // Recorded for failed runs too — a call that threw still cost money.
    if (outcome.promptTokens !== undefined) {
      update.promptTokens = outcome.promptTokens;
    }
    if (outcome.completionTokens !== undefined) {
      update.completionTokens = outcome.completionTokens;
    }

    if (outcome.status === 'failed') {
      update.error = outcome.error;
    }

    // Best-effort in-memory reflection for callers/tests reading ctx.run.
    try {
      Object.assign(ctx.run, update);
    } catch {
      // The DB write below is what matters, so keep going.
    }

    try {
      // Forked EM, not `this.em`: `finish` is usually called from a catch block
      // reacting to a failure on that same EM, whose unit of work may no longer
      // be flushable. A fork plus nativeUpdate bypasses the identity map, so a
      // failed run lands at 'failed' instead of stranding at 'running'.
      await this.em.fork().nativeUpdate(AiGenerationRun, { id: ctx.runId }, update);
    } catch (bookkeepingError) {
      // Bookkeeping must never mask the caller's real error — `track` is
      // already propagating it.
      console.error(
        `AiRunService.finish: failed to persist outcome for run ${ctx.runId}`,
        bookkeepingError,
      );
    }
  }

  /**
   * Preferred entry point for controllers: times `fn`, records the outcome, and
   * rethrows the original error unchanged. `begin`/`finish` stay public only
   * because they are independently tested and a few call sites still pair them.
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
        ...this.tokenTotals(ctx),
      });
      return result;
    } catch (error) {
      await this.finish(ctx, {
        status: 'failed',
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        ...this.tokenTotals(ctx),
      });
      throw error;
    }
  }

  /** Empty when no response carried usage metadata, so columns stay NULL, not 0. */
  private tokenTotals(ctx: AiRunContext) {
    if (!ctx.tokens?.recorded) return {};
    return {
      promptTokens: ctx.tokens.promptTokens,
      completionTokens: ctx.tokens.completionTokens,
    };
  }
}
