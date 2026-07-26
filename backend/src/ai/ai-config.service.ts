import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiPipelineConfig, aiEnvSchema, aiOverrideSchema } from './ai-config.types';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

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
