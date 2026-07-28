import { GoogleGenAI } from '@google/genai';
import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { AiMetricsService } from './ai-metrics.service';
import { BaselineService } from './baseline.service';
import { ConfigService } from '@nestjs/config';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';
import { Startup } from 'src/entities/startup.entity';
import { StartupApplicationDto } from 'src/startup/dto/startup.dto';
import { z } from 'zod';
import { AiRecommendation } from 'src/entities/ai-recommendation.entity';
import { AiBiasAudit } from 'src/entities/ai-bias-audit.entity';
import { RagContext } from 'src/entities/rag-context.entity';
import { AiRunContext } from './ai-run.service';
import { AiConfigService } from './ai-config.service';
import { AiGenerationRun } from 'src/entities/ai-generation-run.entity';
import { EmbeddingIndexService, RAG_CONTEXT_SOURCE } from './embedding-index.service';
import { EmbeddingService } from './embedding.service';
import { RagStrategy, RubricMode } from './ai-config.types';
import {
  CorpusRowMetadata,
  MAX_READINESS_LEVEL,
  RUBRIC_SOURCE_TYPE,
  rubricKey,
} from './rag-corpus.types';
import { readinessLevelsByType } from '../common/readiness-levels.util';

/** How many context rows reach the prompt. Matches the previous keyword slice. */
export const RAG_TOP_K = 3;

/**
 * Cosine-similarity floor for a semantically retrieved context.
 *
 * A floor is not optional here. Nearest-neighbour search always returns its top
 * K, so without one every generation gets three "verified contexts" no matter
 * how unrelated they are — and feeding irrelevant text to a grounded prompt as
 * corroboration is a way to *cause* the hallucination Objective 1 is meant to
 * reduce. The keyword arm has the same guard as `score > 0`.
 *
 * Calibrated, not guessed — see measurement/calibrate-similarity.js, run
 * 2026-07-27 over nine startup descriptions in three domains (36 pairs):
 *
 *   threshold   same-domain kept   cross-domain leaked
 *     0.70            9/9                21/27  (78%)
 *     0.76            8/9                 9/27  (33%)
 *     0.78            8/9                 3/27  (11%)   <- chosen
 *     0.80            6/9                 1/27   (4%)
 *     0.82            4/9                 0/27   (0%)
 *
 * The two distributions overlap — same-domain runs as low as 0.7295 and
 * cross-domain as high as 0.8036 — so no threshold separates them cleanly and
 * this is a trade-off, not a boundary. 0.78 keeps 8 of 9 true neighbours while
 * cutting the leak to 11%; 0.80 buys little and loses a third of real matches.
 *
 * An earlier value of 0.70 was fitted to one hand-picked pair and let an
 * agriculture startup through at 0.765 as context for a health platform.
 *
 * Embeddings score same-register prose high across the board, which is why the
 * usable band is this narrow and this high. Re-run the calibration if the
 * embedding model or the shape of stored context changes.
 */
export const RAG_MIN_SIMILARITY = 0.78;

/** Shape returned by both retrieval arms, so the prompt builder sees one type. */
export interface RetrievedContext {
  sourceType: string;
  title: string;
  content: string;
  confidence: number;
}

const AI_GROUNDING_INSTRUCTION =
  'Only use facts explicitly present in the user-provided input. Never invent names, numbers, dates, or organizations. If you are uncertain about a field, return null instead of guessing.';

const readinessRnaSchema = z.array(
  z.object({
    readiness_level_type: z.string(),
    rna: z.string().nullable(),
  }),
);

const readinessTaskSchema = z.array(
  z.object({
    target_level: z.coerce.number().int().min(0),
    description: z.string(),
  }),
);

const readinessInitiativeSchema = z.array(
  z.object({
    description: z.string(),
    measures: z.string(),
    targets: z.string(),
    remarks: z.string(),
  }),
);

const readinessRoadblockSchema = z.array(
  z.object({
    description: z.string(),
    fix: z.string(),
    riskNumber: z.coerce.number().int().min(0),
  }),
);

const biasReviewSchema = z.object({
  corrected_score: z.coerce.number().int().min(1),
  bias_flagged: z.boolean(),
  justification: z.string(),
});

@Injectable()
export class AiService {
  private readonly ai: GoogleGenAI;

  constructor(
    private config: ConfigService,
    private metrics: AiMetricsService,
    private baselineService: BaselineService,
    private readonly em: EntityManager,
    private readonly aiConfig: AiConfigService,
    private readonly embeddingIndex: EmbeddingIndexService,
    private readonly embeddings: EmbeddingService,
  ) {
    this.ai = new GoogleGenAI({
      apiKey: this.config.get<string>('GEMINI_API_KEY'),
    });
  }

  // Normalize numeric AI scores using the baseline service. Returns scaled value 1-9.
  async normalizeAiScore(score: number) {
    try {
      const res = await this.baselineService.normalizeScore(score);
      return res;
    } catch (err) {
      // on error return a conservative mapping
      return { z: 0, scaled: Math.max(1, Math.min(9, Math.round(score))) };
    }
  }

  async reviewBiasScore(
    ctx: AiRunContext,
    input: {
      dimensionKey: string;
      rawScore: number;
      maxScore: number;
      context: string;
    },
  ): Promise<{ correctedScore: number; biasFlagged: boolean; justification: string }> {
    // Objective 4c - score normalization, independently toggleable.
    const baselineScore = ctx.config.scoreNormalization
      ? Math.max(
          1,
          Math.min(input.maxScore, Math.round((await this.normalizeAiScore(input.rawScore)).scaled)),
        )
      : input.rawScore;

    // Objective 4b - model-based bias review, independently toggleable.
    if (!ctx.config.biasReview) {
      return {
        correctedScore: baselineScore,
        biasFlagged: baselineScore !== input.rawScore,
        justification: ctx.config.scoreNormalization
          ? 'Baseline normalization applied; model bias review disabled.'
          : 'Bias review and normalization disabled; raw score used.',
      };
    }

    const baselineScoreLine = ctx.config.scoreNormalization
      ? `
      Baseline normalized score: ${baselineScore}`
      : '';
    const prompt = `
      You are reviewing a startup assessment score for possible bias.
      Dimension: ${input.dimensionKey}
      Raw score: ${input.rawScore}${baselineScoreLine}
      Maximum allowed score: ${input.maxScore}
      Context: ${input.context}

      Correct the score only if the raw score appears inflated, understated, or inconsistent with the context.
      Return JSON with corrected_score, bias_flagged, and justification.
      corrected_score must be between 1 and ${input.maxScore}.
    `;

    try {
      const review = await this.callAiExpectJson({
        ctx,
        prompt,
        schema: biasReviewSchema,
        fallback: {
          corrected_score: baselineScore,
          bias_flagged: baselineScore !== input.rawScore,
          justification: ctx.config.scoreNormalization
            ? 'Baseline normalization applied because the model review could not be parsed.'
            : 'Model bias review could not be parsed; raw score used.',
        },
        correctivePrompt:
          'Return valid JSON only. Keep the corrected score within the allowed range and explain the adjustment briefly.',
      });

      const correctedScore = Math.max(
        1,
        Math.min(input.maxScore, Math.round(review.corrected_score || baselineScore)),
      );

      return {
        correctedScore,
        biasFlagged: review.bias_flagged || correctedScore !== input.rawScore,
        justification: review.justification || 'Bias review completed.',
      };
    } catch {
      return {
        correctedScore: baselineScore,
        biasFlagged: baselineScore !== input.rawScore,
        justification: ctx.config.scoreNormalization
          ? 'Baseline normalization applied because the model review failed.'
          : 'Model bias review failed; raw score used.',
      };
    }
  }

  async recordAiRecommendation(input: {
    startupId?: number;
    dimensionKey: string;
    recommendationKind: string;
    content: string;
    validationStatus?: string;
    confidenceStatus?: string;
    notes?: string | null;
    generationRun?: AiGenerationRun;
  }) {
    const recommendation = this.em.create(AiRecommendation, {
      startup: input.startupId ? this.em.getReference(Startup, input.startupId) : undefined,
      dimensionKey: input.dimensionKey,
      recommendationKind: input.recommendationKind,
      content: input.content,
      validationStatus: input.validationStatus ?? 'validated',
      confidenceStatus: input.confidenceStatus ?? 'high-confidence',
      notes: input.notes ?? null,
      generationRun: input.generationRun,
      createdAt: new Date(),
    });

    this.em.persist(recommendation);
    await this.em.flush();
    return recommendation;
  }

  async recordBiasAudit(input: {
    startupId?: number;
    dimensionKey: string;
    rawScore: number;
    correctedScore: number;
    deviation: number;
    threshold: number;
    biasFlagged?: boolean;
    biasStatus?: string;
    justification?: string | null;
    generationRun?: AiGenerationRun;
  }) {
    const audit = this.em.create(AiBiasAudit, {
      startup: input.startupId ? this.em.getReference(Startup, input.startupId) : undefined,
      dimensionKey: input.dimensionKey,
      rawScore: input.rawScore,
      correctedScore: input.correctedScore,
      deviation: input.deviation,
      threshold: input.threshold,
      biasFlagged: input.biasFlagged ?? false,
      biasStatus: input.biasStatus ?? 'normalized',
      justification: input.justification ?? null,
      generationRun: input.generationRun,
      createdAt: new Date(),
    });

    this.em.persist(audit);
    await this.em.flush();
    return audit;
  }

  async recordRagContext(input: {
    startupId?: number;
    sourceType: string;
    title: string;
    content: string;
    metadata?: Record<string, unknown> | null;
    confidence?: number;
  }) {
    const ragContext = this.em.create(RagContext, {
      startup: input.startupId ? this.em.getReference(Startup, input.startupId) : undefined,
      sourceType: input.sourceType,
      title: input.title,
      content: input.content,
      metadata: input.metadata ?? null,
      confidence: input.confidence ?? null,
      createdAt: new Date(),
    });

    this.em.persist(ragContext);
    await this.em.flush();

    // Index immediately: a context row that is never embedded is invisible to
    // semantic retrieval, and this is the only place rag_contexts is written.
    // Deliberately not awaited-and-thrown — a failed embedding must not fail
    // the startup application that produced the text.
    await this.embeddingIndex.indexRagContext(ragContext);

    return ragContext;
  }

  private scoreRagMatch(query: string, candidate: string) {
    const tokenize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2);

    const queryTokens = new Set(tokenize(query));
    const candidateTokens = new Set(tokenize(candidate));

    if (!queryTokens.size || !candidateTokens.size) {
      return 0;
    }

    let overlap = 0;
    for (const token of queryTokens) {
      if (candidateTokens.has(token)) {
        overlap += 1;
      }
    }

    return overlap / Math.max(queryTokens.size, candidateTokens.size);
  }

  /** The startup's own text, used as the retrieval query under either strategy. */
  private buildRetrievalQuery(startup: Startup) {
    return [
      startup.name,
      startup.links ?? '',
      startup.groupName ?? '',
      startup.universityName ?? '',
      startup.capsuleProposal?.title ?? '',
      startup.capsuleProposal?.description ?? '',
      startup.capsuleProposal?.problemStatement ?? '',
      startup.capsuleProposal?.targetMarket ?? '',
      startup.capsuleProposal?.solutionDescription ?? '',
      startup.capsuleProposal?.scope ?? '',
      startup.capsuleProposal?.methodology ?? '',
    ]
      .join(' ')
      .trim();
  }

  /**
   * Retrieve context to put in front of the model.
   *
   * @param strategy Which retrieval arm to run. Defaults to keyword so that a
   *   caller that has not been updated keeps the pre-existing behaviour rather
   *   than silently switching to embeddings.
   */
  async getRelevantRagContexts(
    startup: Startup,
    em: EntityManager,
    strategy: RagStrategy = 'keyword',
  ): Promise<RetrievedContext[]> {
    const query = this.buildRetrievalQuery(startup);
    if (!query) {
      return [];
    }

    if (strategy === 'semantic') {
      return this.retrieveSemantic(startup, em, query);
    }
    return this.retrieveByKeyword(em, query);
  }

  private async retrieveByKeyword(
    em: EntityManager,
    query: string,
  ): Promise<RetrievedContext[]> {
    const contexts = await em.find(
      RagContext,
      { sourceType: { $ne: RUBRIC_SOURCE_TYPE } },
      { orderBy: { createdAt: 'DESC' } },
    );

    return contexts
      .map((context) => ({
        context,
        score: this.scoreRagMatch(query, `${context.title} ${context.content}`),
      }))
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, RAG_TOP_K)
      .map(({ context, score }) => ({
        sourceType: context.sourceType,
        title: context.title,
        content: context.content,
        confidence: context.confidence ?? score,
      }));
  }

  /**
   * Nearest neighbours by embedding distance, computed in Postgres.
   *
   * The ordering is done by pgvector's `<=>` rather than by pulling every
   * vector into Node and sorting there — at 768 float4 per row that is ~3KB of
   * transfer per candidate for a result set of three.
   */
  private async retrieveSemantic(
    startup: Startup,
    em: EntityManager,
    query: string,
  ): Promise<RetrievedContext[]> {
    const vector = await this.embeddings.embed(query);
    if (!vector) {
      // No vector, no ranking. Falling back to keyword here would quietly
      // report a semantic run that never happened, which is exactly the kind
      // of contamination the arm comparison cannot tolerate.
      return [];
    }

    const rows = await em.getConnection().execute<
      {
        source_type: string;
        title: string;
        content: string;
        confidence: number | null;
        similarity: number;
      }[]
    >(
      `select rc.source_type, rc.title, rc.content, rc.confidence,
              1 - (ve.embedding <=> ?::vector) as similarity
         from vector_embeddings ve
         join rag_contexts rc on rc.id = ve.source_id::int
        where ve.source_type = ?
          and rc.startup_id is distinct from ?
          and rc.source_type <> ?
        order by ve.embedding <=> ?::vector
        limit ?`,
      [
        `[${vector.join(',')}]`,
        RAG_CONTEXT_SOURCE,
        // Exclude the startup's own context. Retrieving your own capsule
        // proposal back as a "verified prior profile" is circular: the model
        // would read its own input as independent corroboration.
        startup.id,
        RUBRIC_SOURCE_TYPE,
        `[${vector.join(',')}]`,
        RAG_TOP_K,
      ],
    );

    return rows
      .filter((row) => row.similarity >= RAG_MIN_SIMILARITY)
      .map((row) => ({
        sourceType: row.source_type,
        title: row.title,
        content: row.content,
        confidence: row.confidence ?? row.similarity,
      }));
  }

  private groundPrompt(prompt: string) {
    return `${prompt}\n\nGrounding instruction: ${AI_GROUNDING_INSTRUCTION}`;
  }

  /**
   * Chokepoint for prompt-shaped, ctx-driven Gemini calls. Sampling parameters
   * go inside `config` — passing them at the top level silently does nothing.
   *
   * No `maxOutputTokens` is sent: none of these calls was ever actually
   * capped (the pre-existing top-level value was silently dropped by the
   * SDK), and picking one now would be a guess that can truncate long
   * extractions. See TODO_CHECKLIST §5.
   *
   * The capsule-parsing methods (getCapsuleProposalInfo,
   * getCapsuleProposalInfoFromImage, generateStartupAnalysisSummary) are
   * tracked and ctx-driven too, but call the SDK directly rather than through
   * here: the image variant sends a parts array instead of a string prompt and
   * skips grounding, and the other two need the raw response rather than this
   * method's return shape. They call accumulateTokenUsage themselves, so their
   * spend still lands on the run.
   */
  private async generate(
    ctx: AiRunContext,
    prompt: string,
    temperatureOverride?: number,
  ) {
    const res = await this.ai.models.generateContent({
      model: ctx.config.model,
      contents: ctx.config.grounding ? this.groundPrompt(prompt) : prompt,
      config: {
        temperature: temperatureOverride ?? ctx.config.temperature,
      },
    });

    this.accumulateTokenUsage(ctx, res?.usageMetadata);

    return res;
  }

  /**
   * Folds one model response's usage into the run's running total, so the
   * ai_generation_runs row records the whole run's spend rather than the last
   * call's — `callAiExpectJson` retries, and batch generation loops, so a run
   * routinely makes more than one call. Usage metadata is optional on the
   * SDK response, so an absent block simply contributes nothing.
   *
   * Known under-count: completionTokens sums `candidatesTokenCount` only.
   * Gemini 2.5 bills thinking tokens separately as `thoughtsTokenCount`, which
   * is NOT included in that figure, so recorded output spend is a floor rather
   * than a total on any thinking-enabled model. See TODO_CHECKLIST.md section 5.
   */
  private accumulateTokenUsage(
    ctx: AiRunContext,
    usage?: { promptTokenCount?: number; candidatesTokenCount?: number },
  ) {
    if (!usage || !ctx?.tokens) return;

    ctx.tokens.promptTokens += usage.promptTokenCount ?? 0;
    ctx.tokens.completionTokens += usage.candidatesTokenCount ?? 0;
    ctx.tokens.recorded = true;
  }

  private extractJsonPayload(text: string) {
    const firstCurly = text.indexOf('{');
    const firstSquare = text.indexOf('[');
    const candidates = [firstCurly, firstSquare].filter((index) => index !== -1);
    const jsonStart = candidates.length ? Math.min(...candidates) : -1;
    const lastCurly = text.lastIndexOf('}');
    const lastSquare = text.lastIndexOf(']');
    const jsonEnd = Math.max(lastCurly, lastSquare);

    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      return null;
    }

    return text.substring(jsonStart, jsonEnd + 1);
  }

  private async callAiExpectJson<T>(options: {
    ctx: AiRunContext;
    prompt: string;
    schema: z.ZodType<T>;
    fallback: T;
    correctivePrompt: string;
  }): Promise<T> {
    const { ctx, prompt, schema, fallback, correctivePrompt } = options;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await this.generate(
        ctx,
        attempt === 1 ? prompt : `${prompt}\n\n${correctivePrompt}`,
        attempt === 1 ? ctx.config.temperature : ctx.config.temperature + 0.2,
      );

      const text = res?.text?.trim();
      if (!text) {
        await this.metrics.recordFailure({ type: 'no_text', detail: { attempt } });
        continue;
      }

      const payload = this.extractJsonPayload(text);
      if (!payload) {
        await this.metrics.recordFailure({ type: 'no_json', detail: { attempt, snippet: text.slice(0, 1000) } });
        continue;
      }

      try {
        const parsed = JSON.parse(payload);
        const validated = schema.safeParse(parsed);

        if (validated.success) {
          return validated.data;
        }

        await this.metrics.recordFailure({
          type: 'schema_invalid',
          detail: { attempt, issues: validated.error.issues.map((issue) => issue.message) },
        });
      } catch (error) {
        await this.metrics.recordFailure({
          type: 'invalid_json',
          detail: { attempt, snippet: text.slice(0, 1000), error: error instanceof Error ? error.message : String(error) },
        });
      }
    }

    return fallback;
  }

  async getCapsuleProposalInfo(ctx: AiRunContext, text: string) {
    const prompt = `Based on the text ${text},
        Task: extract the text for:
        -Acceleration Proposal Title ( can be found above the Duration: 3 months, etc.)
        - Startup Description
        - Problem Statement
        - Target Market
        - Solution Description
        - Objectives
        - Scope of The Proposal
        - Methodology and Expected Outputs

        Requirement: The response should be in a JSON format.
        It should consist of title, startup_description, problem_statement, target_market, solution_description, objectives, scope, and methodology
        JSON format: {"title": "", "startup_description": "", "problem_statement": (int), "target_market": "", "solution_description": "", "objectives": "", "scope": "", "methodology": ""}
        `;

    // No maxOutputTokens: this extracts eight full prose fields from a whole
    // document, and a cap here truncates the JSON mid-object, which the
    // caller's JSON.parse turns into a blank extraction review screen.
    const res = await this.ai.models.generateContent({
      model: ctx.config.model,
      contents: ctx.config.grounding ? this.groundPrompt(prompt) : prompt,
      config: {
        temperature: ctx.config.temperature,
      },
    });

    this.accumulateTokenUsage(ctx, res?.usageMetadata);

    return res.text;
  }

  /**
   * Send an image directly to Gemini's vision model for OCR + field extraction.
   * This bypasses Tesseract entirely and gives far better results for handwritten documents.
   *
   * Tracked under the `capsule_extract` operation, so the model and pipeline
   * config behind Objective 3's handwriting path are attributable like every
   * other run. Deliberately does not apply the groundPrompt() wrapper:
   * contents here is an image array (inlineData + instruction text), not a
   * string prompt, so the text-oriented grounding instruction doesn't apply
   * cleanly — hence no ctx.config.grounding branch below.
   */
  async getCapsuleProposalInfoFromImage(
    ctx: AiRunContext,
    imageBuffer: Buffer,
    mimeType: string,
  ) {
    const base64Image = imageBuffer.toString('base64');
    const res = await this.ai.models.generateContent({
      model: ctx.config.model,
      // No maxOutputTokens: the response carries a raw_transcription field
      // (the full document text) on top of the 8 extracted proposal fields,
      // so any fixed cap risks truncating the JSON.
      config: {
        temperature: ctx.config.temperature,
      },
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image,
              },
            },
            {
              text: `You are an expert document reader and startup proposal analyst. Carefully read ALL text in this image — whether typed or handwritten.

Step 1: Transcribe every word you can see in the image verbatim into the "raw_transcription" field.

Step 2: Extract or intelligently infer ALL of the following fields. Use every clue in the image — project title, startup name, dates, funding amounts, duration, any keywords — to generate meaningful content for EVERY field:

- title: The project/proposal title (use the project title or startup name from the image)
- startup_description: A description of the startup. If not explicitly written, compose a brief description using the startup name, project title, funding requested, date established, and any other visible details.
- problem_statement: The problem the startup is trying to solve. If not explicitly written, infer from the project title/description what problem this startup likely addresses.
- target_market: Who the startup serves. If not explicitly written, infer a likely target market based on the startup name and project context.
- solution_description: What solution the startup proposes. If not explicitly written, infer a plausible solution based on the project title and available context.
- objectives: The goals of the proposal. If not explicitly written, generate reasonable objectives like securing funding, developing the product, reaching target market, etc. based on the funding amount and duration visible.
- scope: The scope of the proposal. If not explicitly written, generate a reasonable scope based on the project duration, funding, and title.
- methodology: The methodology and expected outputs. If not explicitly written, generate a reasonable methodology based on the project duration and context.

CRITICAL RULES:
- NEVER leave any field as an empty string. Every field MUST have meaningful content.
- Use all visible information (dates, amounts, names, durations) to make each field as specific and relevant as possible.
- Write in a professional, formal tone suitable for a startup acceleration proposal.
- Each field should have at least 40 characters of content.

IMPORTANT: Return ONLY valid JSON with no markdown formatting, no code blocks, no backticks, no extra text before or after the JSON.
JSON format: {"title": "", "startup_description": "", "problem_statement": "", "target_market": "", "solution_description": "", "objectives": "", "scope": "", "methodology": "", "raw_transcription": ""}`,
            },
          ],
        },
      ],
    });

    this.accumulateTokenUsage(ctx, res?.usageMetadata);

    return res.text;
  }

  async generateStartupAnalysisSummary(
    ctx: AiRunContext,
    dto: StartupApplicationDto,
  ): Promise<string> {
    const prompt = `Please provide a comprehensive analysis of the following startup proposal:

      Title: ${dto.title}
      Description: ${dto.description}
      Problem Statement: ${dto.problemStatement}
      Target Market: ${dto.targetMarket}
      Solution Description: ${dto.solutionDescription}
      Objectives: ${dto.objectives.join('\n')}
      Proposal Scope: ${dto.proposalScope}
      Methodology: ${dto.methodology}
      Historical Timeline: ${dto.historicalTimeline?.map((h) => `${h.monthYear}: ${h.description}`).join('\n') || 'Not provided'}
      Competitive Advantage Analysis: ${
        dto.competitiveAdvantageAnalysis
          ?.map(
            (c) =>
              `Competitor: ${c.competitorName}
         Offer: ${c.offer}
         Pricing Strategy: ${c.pricingStrategy}`,
          )
          .join('\n\n') || 'Not provided'
      }
      Intellectual Property Status: ${dto.intellectualPropertyStatus}

      Analyze the startup proposal and provide a concise three-sentence summary that covers:
      1. Overall viability assessment (market potential and solution strength)
      2. Key competitive advantages and growth strategy feasibility
      3. Critical risks and primary recommendations
      
      Important: 
      - Provide exactly three sentences
      - Start directly with the analysis, no introductory phrases
      - Be clear and direct about the startup's potential
      - Focus on the most impactful insights
      - Keep output concise while covering essential points`;

    const res = await this.ai.models.generateContent({
      model: ctx.config.model,
      contents: ctx.config.grounding ? this.groundPrompt(prompt) : prompt,
      config: {
        temperature: ctx.config.temperature,
      },
    });

    this.accumulateTokenUsage(ctx, res?.usageMetadata);

    if (!res.text) {
      throw new Error('AI response did not contain any text');
    }

    return res.text.trim();
  }

  async generateRNAsFromPrompt(
    ctx: AiRunContext,
    prompt: string,
  ): Promise<{ readiness_level_type: string; rna: string | null }[]> {
    return this.callAiExpectJson({
      ctx,
      prompt,
      schema: readinessRnaSchema,
      fallback: [],
      correctivePrompt:
        'The previous answer was invalid. Return only a JSON array where every item has readiness_level_type and rna fields as strings.',
    });
  }

  async generateTasksFromPrompt(
    ctx: AiRunContext,
    prompt: string,
  ): Promise<{ target_level: number; description: string }[]> {
    const tasks = await this.callAiExpectJson({
      ctx,
      prompt,
      schema: readinessTaskSchema,
      fallback: [],
      correctivePrompt:
        'The previous answer was invalid. Return only a JSON array where every item has an integer target_level and a description string.',
    });

    // Normalize any numeric target_level fields using baseline
    const normalized = await Promise.all(
      tasks.map(async (t) => {
        try {
          const n = await this.baselineService.normalizeScore(Number(t.target_level));
          return { ...t, target_level_normalized: n.scaled, target_level_z: n.z };
        } catch (err) {
          return { ...t, target_level_normalized: t.target_level };
        }
      }),
    );
    return normalized as any;
  }

  async generateInitiativesFromPrompt(
    ctx: AiRunContext,
    prompt: string,
  ): Promise<
    {
      description: string;
      measures: string;
      targets: string;
      remarks: string;
    }[]
  > {
    return this.callAiExpectJson({
      ctx,
      prompt,
      schema: readinessInitiativeSchema,
      fallback: [],
      correctivePrompt:
        'The previous answer was invalid. Return only a JSON array where every item has description, measures, targets, and remarks fields as strings.',
    });
  }

  async refineRnsDescription(
    ctx: AiRunContext,
    prompt: string,
  ): Promise<{ refinedDescription: string; aiCommentary: string }> {
    const res = await this.generate(ctx, prompt);

    if (!res.text) {
      throw new Error('AI response did not contain any text');
    }

    const [refinedDescriptionRaw, aiCommentaryRaw] =
      res.text.split(/\n?={5,}\n?/);
    const refinedDescription = refinedDescriptionRaw
      ? refinedDescriptionRaw.trim()
      : '';
    const aiCommentary = aiCommentaryRaw ? aiCommentaryRaw.trim() : '';
    return {
      refinedDescription,
      aiCommentary,
    };
  }

  async generateRoadblocksFromPrompt(
    ctx: AiRunContext,
    prompt: string,
  ): Promise<{ description: string; fix: string; riskNumber: number }[]> {
    const roadblocks = await this.callAiExpectJson({
      ctx,
      prompt,
      schema: readinessRoadblockSchema,
      fallback: [],
      correctivePrompt:
        'The previous answer was invalid. Return only a JSON array where every item has description and fix as strings and riskNumber as an integer.',
    });

    const normalized = await Promise.all(
      roadblocks.map(async (r) => {
        try {
          const n = await this.baselineService.normalizeScore(Number(r.riskNumber));
          return { ...r, riskNumber_normalized: n.scaled, riskNumber_z: n.z };
        } catch (err) {
          return { ...r, riskNumber_normalized: r.riskNumber };
        }
      }),
    );

    return normalized as any;
  }

  async createBasePrompt(
    ctx: AiRunContext,
    startup: Startup,
    em: EntityManager,
    opts?: {
      /**
       * Set only by the RNA-generation fallback (rna.service.ts) after it has
       * already run RagQueryService.queryVectorDatabase under this mode and
       * gotten an empty/low-confidence result. When that mode is 'semantic',
       * buildRubricBlock's own deterministic lookup is suppressed rather than
       * silently substituted — see the rubricMode note on buildRubricBlock
       * for why this can't just read ctx.config.rubricMode itself. Every other
       * caller (initiatives, roadblocks, RNA/RNS refine) omits this and keeps
       * the fixed deterministic mechanism unconditionally.
       */
      rubricMode?: RubricMode;
    },
  ): Promise<string | null> {
    const capsuleProposalInfo = startup.capsuleProposal;
    if (!capsuleProposalInfo) return null;

    const startupReadinessLevels = await em.find(
      StartupReadinessLevel,
      {
        startup: startup,
      },
      {
        populate: ['readinessLevel'],
      },
    );

    const { T: trl, M: mrl, A: arl, O: orl, R: rrl, I: irl } =
      readinessLevelsByType(startupReadinessLevels);
    const ragContexts = ctx.config.rag
      ? await this.getRelevantRagContexts(startup, em, ctx.config.ragStrategy)
      : [];
    const ragBlock = ragContexts.length
      ? `\nVerified context retrieved from similar startup records:\n${ragContexts
          .map((context) => `- [${context.sourceType}] ${context.title}: ${context.content}`)
          .join('\n')}`
      : ctx.config.rag ? '\nVerified context retrieved from similar startup records: none found' : '';
    // Rubrics come from the dimension keys, not from similarity, and are
    // deliberately independent of ctx.config.ragStrategy: that setting selects
    // how *peers* are found and its measured comparison must not be perturbed
    // by a rubric change. The one exception is opts.rubricMode === 'semantic',
    // which suppresses the block entirely rather than mislabelling a
    // deterministic result as belonging to the semantic arm — see the opts
    // JSDoc above.
    const rubricBlock =
      ctx.config.ragCorpus && opts?.rubricMode !== 'semantic'
        ? await this.buildRubricBlock(em, startupReadinessLevels)
        : '';

    return `
      Given these data:
      Acceleration Proposal Title: ${capsuleProposalInfo.title}
      Duration: 3 months
      I. About the startup
      A. Startup Description
      ${capsuleProposalInfo.description}
      B. Problem Statement
      ${capsuleProposalInfo.problemStatement}
      C. Target Market
      ${capsuleProposalInfo.targetMarket}
      D. Solution Description
      ${capsuleProposalInfo.solutionDescription}
      II. About the Proposed Acceleration
      A. Objectives
      ${capsuleProposalInfo.objectives}
      B. Scope of The Proposal
      ${capsuleProposalInfo.scope}
      C. Methodology and Expected Outputs
      ${capsuleProposalInfo.methodology}
      ${rubricBlock}
      Initial Readiness Level:
      TRL ${trl}
      MRL ${mrl}
      ARL ${arl}
      ORL ${orl}
      RRL ${rrl}
      IRL ${irl}
        ${ragBlock}
  `;
  }

  /**
   * Readiness rubrics for the levels this startup actually sits at, plus the
   * next rung up — the model needs to know what "better" looks like to produce
   * a next action rather than a restatement.
   */
  private async buildRubricBlock(
    em: EntityManager,
    levels: StartupReadinessLevel[],
  ): Promise<string> {
    // Deliberately does not read ctx.config.rubricMode itself. That setting
    // exists to compare two mechanisms on the RNA/RNS channel SDD §3.2
    // describes; letting this method also swing the initiative and roadblock
    // paths would change two things at once during a measurement run, which is
    // a confound rather than a control. This always does the exact lookup —
    // callers that need to suppress it under a semantic-mode fallback (see
    // createBasePrompt's opts.rubricMode) do so by not calling it at all,
    // rather than by asking it to branch on the mode.
    const wanted = new Set<string>();
    for (const srl of levels) {
      const type = srl.readinessLevel.readinessType;
      const level = srl.readinessLevel.level;
      wanted.add(rubricKey(type, level));
      wanted.add(rubricKey(type, Math.min(level + 1, MAX_READINESS_LEVEL)));
    }
    if (!wanted.size) return '';

    const rows = await em.find(RagContext, { sourceType: RUBRIC_SOURCE_TYPE });
    const matched = rows.filter((row) =>
      wanted.has((row.metadata as CorpusRowMetadata | undefined)?.key ?? ''),
    );
    if (!matched.length) return '';

    return `\nVerified readiness rubrics (authoritative):\n${matched
      .map((row) => `- ${row.title}: ${row.content}`)
      .join('\n')}\n`;
  }

  async refineInitiative(
    ctx: AiRunContext,
    prompt: string,
  ): Promise<{
    refinedDescription?: string;
    refinedMeasures?: string;
    refinedTargets?: string;
    refinedRemarks?: string;
    aiCommentary: string;
  }> {
    const response = await this.generate(ctx, prompt);

    const content = response.text;
    if (!content) throw new Error('No content in response');

    const [jsonStr, commentary] = content
      .split('=========')
      .map((str) => str.trim());

    const cleanJsonStr = jsonStr.replace(/```json\n?|\n?```/g, '').trim();

    try {
      const refinements = JSON.parse(cleanJsonStr);

      const hasRefinements =
        refinements.refinedDescription ||
        refinements.refinedMeasures ||
        refinements.refinedTargets ||
        refinements.refinedRemarks;

      if (!hasRefinements) {
        console.warn('AI response contained no refinements');
      }

      return {
        ...refinements,
        aiCommentary: commentary || 'Changes applied successfully.',
      };
    } catch (err) {
      console.error('Failed to parse AI response:', content);
      console.error('Parse error:', err);
      throw new Error('AI returned an invalid JSON response');
    }
  }

  async refineRoadblock(
    ctx: AiRunContext,
    prompt: string,
  ): Promise<{
    refinedDescription?: string;
    refinedFix?: string;
    aiCommentary: string;
  }> {
    const response = await this.generate(ctx, prompt);

    const content = response.text;
    if (!content) throw new Error('No content in response');

    const [jsonStr, commentary] = content
      .split('=========')
      .map((str) => str.trim());
    const cleanJsonStr = jsonStr.replace(/```json\n?|\n?```/g, '').trim();

    try {
      const refinements = JSON.parse(cleanJsonStr);

      const hasRefinements =
        refinements.refinedDescription || refinements.refinedFix;

      if (!hasRefinements) {
        console.warn('AI response contained no refinements');
      }

      return {
        ...refinements,
        aiCommentary: commentary || 'Changes applied successfully.',
      };
    } catch (err) {
      console.error('Failed to parse AI response:', content);
      console.error('Parse error:', err);
      throw new Error('AI returned an invalid JSON response');
    }
  }

  async refineRna(
    ctx: AiRunContext,
    prompt: string,
  ): Promise<{
    refinedRna?: string;
    aiCommentary: string;
  }> {
    const response = await this.generate(ctx, prompt);

    const content = response.text;
    if (!content) throw new Error('No content in response');

    const [jsonStr, commentary] = content
      .split('=========')
      .map((str) => str.trim());
    const cleanJsonStr = jsonStr.replace(/```json\n?|\n?```/g, '').trim();

    try {
      const refinements = JSON.parse(cleanJsonStr);

      const hasRefinements = refinements.refinedRna;

      if (!hasRefinements) {
        console.warn('AI response contained no refinements');
      }

      return {
        ...refinements,
        aiCommentary: commentary || 'Changes applied successfully.',
      };
    } catch (err) {
      console.error('Failed to parse AI response:', content);
      console.error('Parse error:', err);
      throw new Error('AI returned an invalid JSON response');
    }
  }
}
