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
  ragStrategy: RagStrategy;
  ragCorpus: boolean;
  rubricMode: RubricMode;
  biasReview: boolean;
  scoreNormalization: boolean;
}

/**
 * How retrieval finds context, when `rag` is on.
 *
 * Separate from the `rag` boolean rather than folded into it, because the
 * comparison needs three arms and not two. `rag: false` answers "does retrieval
 * help at all"; these answer "does *semantic* retrieval beat what was already
 * here". Collapsing them would make a semantic win indistinguishable from the
 * win keyword matching already provided.
 *
 *   keyword  - token overlap between the startup's text and each stored
 *              context. The pre-existing behaviour, kept as the baseline arm.
 *   semantic - nearest neighbours by embedding cosine distance in pgvector.
 */
export const RAG_STRATEGIES = ['keyword', 'semantic'] as const;
export type RagStrategy = (typeof RAG_STRATEGIES)[number];

/**
 * How the readiness-rubric channel finds its rows.
 *
 * Two modes rather than one because SDD §3.2 specifies that the RAG Query
 * Service "queries the vector database using the startup's profile data as the
 * search embedding" for all three channels, while measurement favours an exact
 * lookup. `semantic` below is NOT that mechanism: rag-query.service.ts's
 * retrieveRubrics embeds the bare readinessType name (e.g. "Technology"), not
 * the startup's profile data, so it is the code's own substitute for SDD
 * §3.2's approach rather than an implementation of it. Both were measured
 * (measurement/measure-grounding.js, 2026-07-28) to retrieve nothing against
 * this corpus — the code's substitute scored 0/12 correct-dimension, and the
 * SDD's actual mechanism, tested separately by embedding whole startup
 * profiles, scored 0/2. Kept as a mode anyway so the comparison stays
 * reproducible and the deviation from the SDD is defended with those numbers
 * rather than an opinion.
 *
 *   deterministic - exact (readinessType, level) key lookup. Default.
 *   semantic      - the code's substitute for the SDD's mechanism: pgvector
 *                   nearest neighbours over rubric rows using the bare
 *                   dimension name as the query, gated by RAG_MIN_SIMILARITY.
 *                   Measured at 0/12 correct-dimension; see
 *                   measurement/README.md before treating it as equivalent.
 */
export const RUBRIC_MODES = ['deterministic', 'semantic'] as const;
export type RubricMode = (typeof RUBRIC_MODES)[number];

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
  // Defaults to semantic: keyword matching is the thing being replaced, and a
  // default that silently kept it would make the enhanced arm opt-in.
  AI_RAG_STRATEGY: z.enum(RAG_STRATEGIES).optional().default('semantic'),
  AI_RAG_CORPUS_ENABLED: envBoolean(true),
  AI_RAG_RUBRIC_MODE: z.enum(RUBRIC_MODES).optional().default('deterministic'),
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
    ragStrategy: z.enum(RAG_STRATEGIES),
    ragCorpus: z.boolean(),
    rubricMode: z.enum(RUBRIC_MODES),
    biasReview: z.boolean(),
    scoreNormalization: z.boolean(),
  })
  .partial()
  .strict();

export type AiPipelineOverride = z.infer<typeof aiOverrideSchema>;
