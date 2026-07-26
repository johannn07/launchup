import { z } from 'zod';

/**
 * Resolved configuration for a single AI generation run.
 *
 * Each boolean gates one enhancement from the capstone objectives, so that the
 * baseline and enhanced pipelines can be run from the same deployment:
 *   grounding          - Objective 1a, AiService.groundPrompt()
 *   rag                - Objective 1b, AiService.getRelevantRagContexts()
 *   biasReview         - Objective 4b, AiService.reviewBiasScore()
 *   scoreNormalization - Objective 4c, AiService.normalizeAiScore()
 */
export interface AiPipelineConfig {
  model: string;
  temperature: number;
  grounding: boolean;
  rag: boolean;
  biasReview: boolean;
  scoreNormalization: boolean;
}

/** Accepts 'true'/'false'/'1'/'0'; anything else fails validation. */
const envBoolean = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === 'true' || value === '1'));

export const aiEnvSchema = z.object({
  GEMINI_MODEL: z.string().min(1, 'GEMINI_MODEL must not be blank').optional(),
  AI_TEMPERATURE: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return 0;
      const parsed = Number(value);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'AI_TEMPERATURE must be a number between 0 and 2',
        });
        return z.NEVER;
      }
      return parsed;
    }),
  AI_GROUNDING_ENABLED: envBoolean(true),
  AI_RAG_ENABLED: envBoolean(true),
  AI_BIAS_REVIEW_ENABLED: envBoolean(true),
  AI_SCORE_NORMALIZATION_ENABLED: envBoolean(true),
  AI_ALLOW_REQUEST_OVERRIDE: envBoolean(false),
});

/** Partial override accepted from the X-Ai-Pipeline-Config header. */
export const aiOverrideSchema = z
  .object({
    model: z.string().min(1),
    temperature: z.number().min(0).max(2),
    grounding: z.boolean(),
    rag: z.boolean(),
    biasReview: z.boolean(),
    scoreNormalization: z.boolean(),
  })
  .partial()
  .strict();

export type AiPipelineOverride = z.infer<typeof aiOverrideSchema>;
