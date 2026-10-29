import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from '@mikro-orm/core';
import type { GoogleGenAI } from '@google/genai';
import { AiService } from './ai.service';
import { AiConfigService } from './ai-config.service';
import { AiQuotaUsage } from '../entities/ai-quota-usage.entity';
import { countGenerateContent, remainingRequests } from './quota-counter';
import { quotaWindow } from './quota-window';

const DEFAULT_DAILY_LIMIT = 20;

export interface AiQuotaStatus {
  model: string;
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
  resetAt: Date;
}

@Injectable()
export class AiQuotaService implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly config: ConfigService,
    private readonly aiConfig: AiConfigService,
    private readonly aiService: AiService,
  ) {}

  onModuleInit() {
    // AiService keeps its client private; counting here leaves AiService untouched.
    const { models } = (this.aiService as unknown as { ai: GoogleGenAI }).ai;
    countGenerateContent(models, {
      onCall: (model) => this.record(model, 'call'),
      onQuotaExhausted: (model) => this.record(model, 'exhausted'),
    });
  }

  private get limit() {
    const n = Number(this.config.get('AI_DAILY_REQUEST_LIMIT'));
    return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
  }

  // One atomic upsert, so concurrent generations cannot lose a count.
  private async record(model: string, event: 'call' | 'exhausted') {
    const { start } = quotaWindow(new Date());
    const update =
      event === 'call'
        ? 'calls = ai_quota_usage.calls + 1'
        : 'exhausted = true';
    await this.em
      .fork()
      .getConnection()
      .execute(
        `insert into ai_quota_usage (model, window_start, calls, exhausted)
         values (?, ?, ?, ?)
         on conflict (model, window_start) do update set ${update}`,
        [model, start, event === 'call' ? 1 : 0, event === 'exhausted'],
      );
  }

  /** For the model generation currently uses. */
  async status(now = new Date()): Promise<AiQuotaStatus> {
    const model = this.aiConfig.defaults.model;
    const { start, resetAt } = quotaWindow(now);
    const row = await this.em
      .fork()
      .findOne(AiQuotaUsage, { model, windowStart: start });
    const used = row?.calls ?? 0;
    const exhausted = row?.exhausted ?? false;
    const limit = this.limit;
    return {
      model,
      limit,
      used,
      remaining: remainingRequests({ used, exhausted, limit }),
      exhausted,
      resetAt,
    };
  }
}
