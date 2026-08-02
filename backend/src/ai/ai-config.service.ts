import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiPipelineConfig, aiEnvSchema, aiOverrideSchema } from './ai-config.types';

/**
 * Fallback when GEMINI_MODEL is unset.
 *
 * Not a lite tier: Objectives 1 and 4 need the model to actually reason.
 * Measured 2026-07-27 on a real RNA prompt — every `*-flash-lite` spends 0
 * thinking tokens, and 2.5-flash-lite answered a Technology question in terms
 * of revenue and product-market fit. 3.6-flash spends ~780 and stays on topic.
 *
 * Not Pro: no Pro model is reachable on the free tier (2.5-pro, 3-pro-preview
 * and 3.1-pro-preview all 429 at 20s spacing, so not a per-minute limit). Not
 * 2.5-flash, which now 404s as "no longer available to new users".
 *
 * Costs ~2.8x tokens and 3x latency of 2.5-flash-lite. If quota becomes the
 * binding constraint, `gemini-3.5-flash-lite` is the escape hatch — faster and
 * better than 2.5-flash-lite, but does no reasoning.
 */
const DEFAULT_MODEL = 'gemini-3.6-flash';

@Injectable()
export class AiConfigService {
  readonly defaults: AiPipelineConfig;
  readonly allowRequestOverride: boolean;

  constructor(private readonly config: ConfigService) {
    const parsed = aiEnvSchema.safeParse({
      GEMINI_MODEL: this.config.get<string>('GEMINI_MODEL'),
      AI_TEMPERATURE: this.config.get<string>('AI_TEMPERATURE'),
      AI_GROUNDING_ENABLED: this.config.get<string>('AI_GROUNDING_ENABLED'),
      AI_RAG_ENABLED: this.config.get<string>('AI_RAG_ENABLED'),
      AI_RAG_STRATEGY: this.config.get<string>('AI_RAG_STRATEGY'),
      AI_RAG_CORPUS_ENABLED: this.config.get<string>('AI_RAG_CORPUS_ENABLED'),
      AI_RAG_RUBRIC_MODE: this.config.get<string>('AI_RAG_RUBRIC_MODE'),
      AI_BIAS_REVIEW_ENABLED: this.config.get<string>('AI_BIAS_REVIEW_ENABLED'),
      AI_SCORE_NORMALIZATION_ENABLED: this.config.get<string>(
        'AI_SCORE_NORMALIZATION_ENABLED',
      ),
      AI_ALLOW_REQUEST_OVERRIDE: this.config.get<string>(
        'AI_ALLOW_REQUEST_OVERRIDE',
      ),
    });

    if (!parsed.success) {
      // Fail fast: a silently-wrong config invalidates every row produced under
      // it, which the comparison study cannot recover from.
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid AI pipeline configuration - ${detail}`);
    }

    const env = parsed.data;

    this.defaults = Object.freeze({
      model: env.GEMINI_MODEL ?? DEFAULT_MODEL,
      temperature: env.AI_TEMPERATURE,
      grounding: env.AI_GROUNDING_ENABLED,
      rag: env.AI_RAG_ENABLED,
      ragStrategy: env.AI_RAG_STRATEGY,
      ragCorpus: env.AI_RAG_CORPUS_ENABLED,
      rubricMode: env.AI_RAG_RUBRIC_MODE,
      biasReview: env.AI_BIAS_REVIEW_ENABLED,
      scoreNormalization: env.AI_SCORE_NORMALIZATION_ENABLED,
    });

    this.allowRequestOverride = env.AI_ALLOW_REQUEST_OVERRIDE;
  }

  /**
   * @param rawHeader    X-Ai-Pipeline-Config header value, if present.
   * @param isPrivileged Whether the caller may override (Manager/Admin).
   */
  resolve(rawHeader?: string, isPrivileged = false): AiPipelineConfig {
    if (!rawHeader) {
      return this.defaults;
    }

    if (!this.allowRequestOverride || !isPrivileged) {
      throw new ForbiddenException('AI pipeline override is not permitted for this caller');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawHeader);
    } catch {
      throw new BadRequestException('X-Ai-Pipeline-Config must be valid JSON');
    }

    const override = aiOverrideSchema.safeParse(parsedJson);
    if (!override.success) {
      const detail = override.error.issues
        .map((issue) => `${issue.path.join('.') || 'override'}: ${issue.message}`)
        .join('; ');
      throw new BadRequestException(`Invalid AI pipeline override - ${detail}`);
    }

    return Object.freeze({ ...this.defaults, ...override.data });
  }
}
