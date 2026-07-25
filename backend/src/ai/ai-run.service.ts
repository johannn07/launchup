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
    ctx.run.status = outcome.status;
    ctx.run.latencyMs = outcome.latencyMs;
    ctx.run.completedAt = new Date();

    if (outcome.status === 'completed') {
      ctx.run.promptTokens = outcome.promptTokens;
      ctx.run.completionTokens = outcome.completionTokens;
    } else {
      ctx.run.error = outcome.error;
    }

    await this.em.flush();
  }
}
