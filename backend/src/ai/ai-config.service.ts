import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiPipelineConfig, aiEnvSchema, aiOverrideSchema } from './ai-config.types';

/**
 * Fallback when GEMINI_MODEL is unset.
 *
 * `gemini-3.6-flash`, not a lite tier, because Objectives 1 and 4 (hallucination
 * and leniency bias) depend on the model actually reasoning. Measured against
 * this key on 2026-07-27 with a real RNA prompt: every `*-flash-lite` tier
 * spends **0** thinking tokens and 2.5-flash-lite answered a Technology
 * readiness question in terms of revenue and product-market fit — the wrong
 * dimension. 3.6-flash spends ~780 thinking tokens and stays on-topic.
 *
 * Not a Pro tier because no Pro model is reachable on the free API tier —
 * gemini-2.5-pro, gemini-3-pro-preview and gemini-3.1-pro-preview all return
 * 429 (verified with 20s spacing, so not a per-minute limit). Not
 * `gemini-2.5-flash`, which now 404s with "no longer available to new users".
 *
 * Costs roughly 2.8x the tokens and 3x the latency of 2.5-flash-lite. If free
 * tier quota becomes the binding constraint, `gemini-3.5-flash-lite` is the
 * escape hatch — it still beats 2.5-flash-lite on speed, tokens and output
 * quality, but does no reasoning.
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
      AI_BIAS_REVIEW_ENABLED: this.config.get<string>('AI_BIAS_REVIEW_ENABLED'),
      AI_SCORE_NORMALIZATION_ENABLED: this.config.get<string>(
        'AI_SCORE_NORMALIZATION_ENABLED',
      ),
      AI_ALLOW_REQUEST_OVERRIDE: this.config.get<string>(
        'AI_ALLOW_REQUEST_OVERRIDE',
      ),
    });

    if (!parsed.success) {
      // Fail fast. A silently-wrong pipeline config invalidates every row
      // produced under it, which is unrecoverable for the comparison study.
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
      biasReview: env.AI_BIAS_REVIEW_ENABLED,
      scoreNormalization: env.AI_SCORE_NORMALIZATION_ENABLED,
    });

    this.allowRequestOverride = env.AI_ALLOW_REQUEST_OVERRIDE;
  }

  /**
   * Resolve the config for one generation run.
   *
   * @param rawHeader   Value of the X-Ai-Pipeline-Config header, if present.
   * @param isPrivileged Whether the caller's role may override (Manager/Admin).
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
