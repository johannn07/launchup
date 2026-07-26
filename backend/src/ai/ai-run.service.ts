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
 * A single run can make several model calls — `callAiExpectJson` retries once
 * on unparseable/invalid output, and a batch generation loops per item — so
 * this must *accumulate*; recording only the last call's usage would
 * under-report the run's real cost.
 *
 * `recorded` distinguishes "the model reported zero tokens" from "no response
 * ever carried usageMetadata". Only when it is true do we write the counts,
 * so a run whose responses lacked usage metadata leaves the columns NULL
 * (unknown) rather than claiming a measured 0.
 */
export interface AiRunTokenTotals {
  promptTokens: number;
  completionTokens: number;
  recorded: boolean;
}

/**
 * Handle carried through one generation call.
 *
 * `config`, `runId` and `run` are fixed for the life of the run; `tokens` is a
 * deliberately mutable accumulator that the AiService generation chokepoint
 * adds into on every model call.
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
   * Durably attributes an already-open run to a startup.
   *
   * Several operations open their run before the startup id is known (the
   * refine routes only carry the artifact id; generate-initiatives has no
   * startup in its DTO) and backfill it once the owning entity is loaded.
   * Assigning `ctx.run.startup` alone is *not* enough: `finish` writes a
   * fixed payload through a forked EM and never includes `startup`, so on the
   * failure path — where nothing else flushes the request-context EM before
   * the exception reaches Nest — the mutation is discarded and the row keeps
   * `startup_id NULL`. Failed runs are exactly the ones a startup-filtered
   * provenance query most needs to surface, so the attribution gets its own
   * immediate, forked write.
   *
   * Like `finish`, this must never throw: it is bookkeeping, and a failure
   * here must not replace whatever the caller is actually doing.
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

    // Token counts are recorded for failed runs too — a run that made a model
    // call and then threw still cost money, and the point of these columns is
    // to make Gemini spend measurable. They stay absent (NULL) when no
    // response carried usage metadata.
    if (outcome.promptTokens !== undefined) {
      update.promptTokens = outcome.promptTokens;
    }
    if (outcome.completionTokens !== undefined) {
      update.completionTokens = outcome.completionTokens;
    }

    if (outcome.status === 'failed') {
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

  /**
   * The run's accumulated token spend, or an empty object when no model
   * response carried usage metadata — so the columns stay NULL rather than
   * recording a fabricated 0.
   */
  private tokenTotals(ctx: AiRunContext) {
    if (!ctx.tokens?.recorded) return {};
    return {
      promptTokens: ctx.tokens.promptTokens,
      completionTokens: ctx.tokens.completionTokens,
    };
  }
}
