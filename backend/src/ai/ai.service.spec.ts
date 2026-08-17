import { ConfigService } from '@nestjs/config';
import { AiService, LEGACY_SUMMARY_PROMPT } from './ai.service';
import { AiMetricsService } from './ai-metrics.service';
import { BaselineService } from './baseline.service';
import { AiRunContext } from './ai-run.service';
import { AiConfigService } from './ai-config.service';
import { StartupApplicationDto } from 'src/startup/dto/startup.dto';

// Same pattern as ai-config.service.spec.ts's `configFrom`: a `get` returning
// undefined, so AiConfigService falls back to DEFAULT_MODEL. The literal in
// `ctxWith` below is fixture data, not that default.
const undefinedConfigService = { get: () => undefined } as unknown as ConfigService;

const ctxWith = (overrides: Partial<AiRunContext['config']> = {}): AiRunContext =>
  ({
    runId: 1,
    run: {} as any,
    config: Object.freeze({
      model: 'gemini-2.5-flash-lite',
      temperature: 0,
      grounding: true,
      rag: true,
      biasReview: true,
      scoreNormalization: true,
      adversarialSummary: true,
      ...overrides,
    }),
  }) as AiRunContext;

describe('AiService', () => {
  let service: AiService;
  let generateContent: jest.Mock;
  let metrics: { recordFailure: jest.Mock };

  beforeEach(() => {
    generateContent = jest.fn();
    metrics = {
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };

    const baselineServiceMock = {
      getBaseline: jest.fn(),
    } as unknown as BaselineService;

    service = new AiService(
      { get: jest.fn() } as unknown as ConfigService,
      metrics as unknown as AiMetricsService,
      {
        normalizeScore: jest.fn().mockResolvedValue({ scaled: 5, z: 0 }),
      } as any,
      {} as any,
      new AiConfigService(undefinedConfigService),
      // recordRagContext indexes the row it just wrote; nothing under test here
      // reaches that path, so a stub is enough.
      { indexRagContext: jest.fn().mockResolvedValue(true) } as any,
      // Only used by the semantic retrieval arm, which these tests do not take.
      { embed: jest.fn().mockResolvedValue(null) } as any,
    );

    (service as unknown as { ai: { models: { generateContent: jest.Mock } } }).ai = {
      models: { generateContent },
    } as any;
  });

  it('retries when the first response is invalid JSON', async () => {
    generateContent
      .mockResolvedValueOnce({ text: 'not json' })
      .mockResolvedValueOnce({
        text: '[{"readiness_level_type":"Technology","rna":"Build a validated prototype"}]',
      });

    await expect(service.generateRNAsFromPrompt(ctxWith(), 'prompt')).resolves.toEqual([
      {
        readiness_level_type: 'Technology',
        rna: 'Build a validated prototype',
      },
    ]);

    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('returns a fallback array when schema validation fails twice', async () => {
    generateContent.mockResolvedValue({
      text: '[{"unexpected":"field"}]',
    });

    await expect(service.generateRNAsFromPrompt(ctxWith(), 'prompt')).resolves.toEqual([]);

    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('passes valid task responses through unchanged', async () => {
    generateContent.mockResolvedValue({
      text: '[{"target_level":3,"description":"Validate the product hypothesis"}]',
    });

    await expect(service.generateTasksFromPrompt(ctxWith(), 'prompt')).resolves.toEqual([
      {
        target_level: 3,
        description: 'Validate the product hypothesis',
        target_level_normalized: 3,   // ← added to match the normalized output
      },
    ]);

    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('passes sampling parameters inside config, not at the top level', async () => {
    generateContent.mockResolvedValue({
      text: '[{"readiness_level_type":"Technology","rna":"Ship a prototype"}]',
    });

    await service.generateRNAsFromPrompt(ctxWith({ temperature: 0 }), 'prompt');

    const request = generateContent.mock.calls[0][0];
    expect(request.config).toEqual(expect.objectContaining({ temperature: 0 }));
    expect(request).not.toHaveProperty('temperature');
    // These calls used to pass maxOutputTokens at the top level, where the SDK
    // dropped it — nothing was ever capped, so adding one now would be a new
    // truncation regression. See TODO_CHECKLIST §5.
    expect(request.config).not.toHaveProperty('maxOutputTokens');
    expect(request).not.toHaveProperty('maxOutputTokens');
  });

  it('bumps the temperature by 0.2 on the corrective retry', async () => {
    generateContent
      .mockResolvedValueOnce({ text: 'not json' })
      .mockResolvedValueOnce({
        text: '[{"readiness_level_type":"Technology","rna":"Ship a prototype"}]',
      });

    await service.generateRNAsFromPrompt(ctxWith({ temperature: 0.3 }), 'prompt');

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0][0].config.temperature).toBe(0.3);
    // The retry deliberately loosens sampling so the model does not just
    // reproduce the same unparseable output verbatim.
    expect(generateContent.mock.calls[1][0].config.temperature).toBeCloseTo(0.5);
  });

  it('uses the model from the run context', async () => {
    generateContent.mockResolvedValue({ text: '[]' });

    await service.generateRNAsFromPrompt(ctxWith({ model: 'gemini-2.5-pro' }), 'prompt');

    expect(generateContent.mock.calls[0][0].model).toBe('gemini-2.5-pro');
  });

  it('drives capsule text extraction from the run context, not the global defaults', async () => {
    generateContent.mockResolvedValue({ text: '{"title":"Example"}' });

    await service.getCapsuleProposalInfo(
      ctxWith({ model: 'gemini-3.6-flash' }),
      'some proposal text',
    );

    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-3.6-flash');
    expect(request.config).toEqual(expect.objectContaining({ temperature: 0 }));
    expect(request).not.toHaveProperty('temperature');
    // Uncapped: eight prose fields from a whole document, and a truncated
    // response fails JSON.parse into a blank review screen for the founder.
    expect(request.config).not.toHaveProperty('maxOutputTokens');
    expect(request).not.toHaveProperty('maxOutputTokens');
  });

  it('sends the configured model and sampling params inside config for image OCR calls', async () => {
    generateContent.mockResolvedValue({ text: '{"title":"Example"}' });

    await service.getCapsuleProposalInfoFromImage(
      ctxWith({ model: 'gemini-3.6-flash' }),
      Buffer.from('fake-image'),
      'image/png',
    );

    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-3.6-flash');
    expect(request.config).toEqual(expect.objectContaining({ temperature: 0 }));
    expect(request).not.toHaveProperty('temperature');
    // Uncapped: the response carries a full raw_transcription on top of the
    // eight extracted fields.
    expect(request.config).not.toHaveProperty('maxOutputTokens');
    expect(request).not.toHaveProperty('maxOutputTokens');
  });

  describe('createBasePrompt RAG gating', () => {
    const startup = {
      id: 1,
      name: 'AgroLink',
      capsuleProposal: { title: 'AgroLink', description: 'd', problemStatement: 'p' },
    } as any;

    const emWithContexts = () =>
      ({
        find: jest.fn(async (entity: any) => {
          if (entity?.name === 'RagContext') {
            return [{ sourceType: 'profile', title: 'AgroLink', content: 'agro', confidence: 1 }];
          }
          return [];
        }),
      }) as any;

    it('includes retrieved context when rag is enabled', async () => {
      const prompt = await service.createBasePrompt(ctxWith({ rag: true }), startup, emWithContexts());
      expect(prompt).toContain('Verified context retrieved');
    });

    it('omits retrieved context when rag is disabled', async () => {
      const prompt = await service.createBasePrompt(ctxWith({ rag: false }), startup, emWithContexts());
      expect(prompt).not.toContain('Verified context retrieved');
    });

    // The literal "none found" is an anti-hallucination cue: it tells the model
    // retrieval ran and was empty, rather than leaving a silence to fill.
    it('states that retrieval found nothing when rag is enabled but no context matches', async () => {
      const emWithNoContexts = { find: jest.fn().mockResolvedValue([]) } as any;

      const prompt = await service.createBasePrompt(
        ctxWith({ rag: true }),
        startup,
        emWithNoContexts,
      );

      expect(prompt).toContain(
        'Verified context retrieved from similar startup records: none found',
      );
    });

    it('does not query for contexts at all when rag is disabled', async () => {
      const spy = jest.spyOn(service, 'getRelevantRagContexts');
      await service.createBasePrompt(ctxWith({ rag: false }), startup, emWithContexts());
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('createBasePrompt dimension labels', () => {
    const startup = {
      id: 2,
      name: 'ScrambleCo',
      capsuleProposal: { title: 'ScrambleCo', description: 'd', problemStatement: 'p' },
    } as any;

    const srl = (readinessType: string, level: number) => ({
      readinessLevel: { readinessType, level },
    });

    // createBasePrompt's query has no orderBy, and main.ts's seeder inserts in
    // a different order than the live DB, so a positional read would mislabel
    // dimensions on a fresh Neon branch. Every dimension is scrambled here.
    const emWithScrambledLevels = () =>
      ({
        find: jest.fn(async (entity: any) => {
          if (entity?.name === 'StartupReadinessLevel') {
            return [
              srl('Investment', 6),
              srl('Acceptance', 2),
              srl('Technology', 9),
              srl('Regulatory', 4),
              srl('Market', 1),
              srl('Organizational', 7),
            ];
          }
          return [];
        }),
      }) as any;

    it('labels each dimension by its ReadinessType, not by array position', async () => {
      const prompt = await service.createBasePrompt(
        ctxWith({ rag: false }),
        startup,
        emWithScrambledLevels(),
      );

      expect(prompt).toContain('TRL 9');
      expect(prompt).toContain('MRL 1');
      expect(prompt).toContain('ARL 2');
      expect(prompt).toContain('ORL 7');
      expect(prompt).toContain('RRL 4');
      expect(prompt).toContain('IRL 6');
    });
  });

  describe('createBasePrompt rubric gating (Finding 1 — semantic-mode fallback)', () => {
    const startup = {
      id: 3,
      name: 'RubricCo',
      capsuleProposal: { title: 'RubricCo', description: 'd', problemStatement: 'p' },
    } as any;

    const srl = (readinessType: string, level: number) => ({ readinessLevel: { readinessType, level } });

    // Two matching rubric rows (current level + next rung), same shape
    // buildRubricBlock's own em.find(RagContext, ...) call would receive.
    const emWithRubricRow = () =>
      ({
        find: jest.fn(async (entity: any) => {
          if (entity?.name === 'StartupReadinessLevel') {
            return [srl('Technology', 3)];
          }
          if (entity?.name === 'RagContext') {
            return [
              {
                title: 'TRL 3',
                content: 'TRL 3 rubric text',
                metadata: {
                  key: 'trl-3',
                  readinessType: 'Technology',
                  level: 3,
                  provenance: 'standard',
                  citation: 'x',
                },
              },
              {
                title: 'TRL 4',
                content: 'TRL 4 rubric text',
                metadata: {
                  key: 'trl-4',
                  readinessType: 'Technology',
                  level: 4,
                  provenance: 'standard',
                  citation: 'x',
                },
              },
            ];
          }
          return [];
        }),
      }) as any;

    // buildRubricBlock had no coverage in either direction before this.
    it('includes rubric text when ragCorpus is enabled and matching rows exist (positive path)', async () => {
      const prompt = await service.createBasePrompt(
        ctxWith({ ragCorpus: true, rubricMode: 'deterministic', rag: false }),
        startup,
        emWithRubricRow(),
      );

      expect(prompt).toContain('Verified readiness rubrics (authoritative)');
      expect(prompt).toContain('TRL 3 rubric text');
      expect(prompt).toContain('TRL 4 rubric text');
    });

    // A fallback prompt built after an empty semantic retrieval must not pick
    // up the deterministic lookup — that relabels the arm.
    it('suppresses the rubric block when opts.rubricMode is semantic, even with matching rows and ragCorpus enabled', async () => {
      const prompt = await service.createBasePrompt(
        ctxWith({ ragCorpus: true, rag: false }),
        startup,
        emWithRubricRow(),
        { rubricMode: 'semantic' },
      );

      expect(prompt).not.toContain('Verified readiness rubrics');
      expect(prompt).not.toContain('TRL 3 rubric text');
    });

    it('still builds the rubric block when the caller explicitly passes rubricMode: deterministic', async () => {
      const prompt = await service.createBasePrompt(
        ctxWith({ ragCorpus: true, rag: false }),
        startup,
        emWithRubricRow(),
        { rubricMode: 'deterministic' },
      );

      expect(prompt).toContain('Verified readiness rubrics (authoritative)');
    });

    // Initiative/roadblock/refine callers pass no opts, so they keep the fixed
    // deterministic mechanism whatever ctx.config.rubricMode says — otherwise a
    // measurement run changes two things at once.
    it('ignores ctx.config.rubricMode entirely when the caller passes no opts', async () => {
      const prompt = await service.createBasePrompt(
        ctxWith({ ragCorpus: true, rubricMode: 'semantic', rag: false }),
        startup,
        emWithRubricRow(),
      );

      expect(prompt).toContain('Verified readiness rubrics (authoritative)');
    });
  });

  describe('reviewBiasScore flag gating', () => {
    const input = { dimensionKey: 'market', rawScore: 8, maxScore: 9, context: 'ctx' };

    it('skips normalization when scoreNormalization is disabled', async () => {
      const normalizeSpy = jest.spyOn(service as any, 'normalizeAiScore');
      generateContent.mockResolvedValue({
        text: '{"corrected_score":6,"bias_flagged":true,"justification":"inflated"}',
      });

      await service.reviewBiasScore(ctxWith({ scoreNormalization: false }), input);

      expect(normalizeSpy).not.toHaveBeenCalled();
    });

    it('skips the model call when biasReview is disabled', async () => {
      const result = await service.reviewBiasScore(
        ctxWith({ biasReview: false, scoreNormalization: false }),
        input,
      );

      expect(generateContent).not.toHaveBeenCalled();
      expect(result.correctedScore).toBe(8);
      expect(result.biasFlagged).toBe(false);
    });

    it('returns the normalized baseline when review is off but normalization is on', async () => {
      const result = await service.reviewBiasScore(
        ctxWith({ biasReview: false, scoreNormalization: true }),
        input,
      );

      expect(generateContent).not.toHaveBeenCalled();
      expect(result.correctedScore).toBe(5); // baselineService mock returns scaled: 5
    });

    it('does not include "Baseline normalized score" line in prompt when scoreNormalization is disabled', async () => {
      generateContent.mockResolvedValue({
        text: '{"corrected_score":6,"bias_flagged":true,"justification":"x"}',
      });

      await service.reviewBiasScore(ctxWith({ scoreNormalization: false, biasReview: true }), input);

      const promptPassed = generateContent.mock.calls[0][0].contents;
      expect(promptPassed).not.toContain('Baseline normalized score');
    });

    it('includes "Baseline normalized score" line in prompt when scoreNormalization is enabled', async () => {
      generateContent.mockResolvedValue({
        text: '{"corrected_score":6,"bias_flagged":true,"justification":"x"}',
      });

      await service.reviewBiasScore(ctxWith({ scoreNormalization: true, biasReview: true }), input);

      const promptPassed = generateContent.mock.calls[0][0].contents;
      expect(promptPassed).toContain('Baseline normalized score');
    });
  });

  // These three used to read AiConfigService.defaults and open no run row, so
  // the capsule-parsing path was invisible to the provenance table and ignored
  // any X-Ai-Pipeline-Config override.
  describe('capsule-parsing calls contribute to the run', () => {
    const trackedCtx = (): AiRunContext =>
      ({
        ...ctxWith(),
        tokens: { promptTokens: 0, completionTokens: 0, recorded: false },
      }) as AiRunContext;

    it('accumulates token usage from text extraction', async () => {
      generateContent.mockResolvedValue({
        text: '{"title":"Example"}',
        usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 },
      });

      const ctx = trackedCtx();
      await service.getCapsuleProposalInfo(ctx, 'proposal text');

      expect(ctx.tokens).toEqual({
        promptTokens: 900,
        completionTokens: 120,
        recorded: true,
      });
    });

    it('accumulates token usage from the vision path', async () => {
      generateContent.mockResolvedValue({
        text: '{"title":"Example"}',
        usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 300 },
      });

      const ctx = trackedCtx();
      await service.getCapsuleProposalInfoFromImage(
        ctx,
        Buffer.from('fake-image'),
        'image/png',
      );

      expect(ctx.tokens.promptTokens).toBe(1500);
      expect(ctx.tokens.recorded).toBe(true);
    });

    it('sums the vision call and its text fallback into one run total', async () => {
      // parseCapsuleProposal tries vision first and falls back to Tesseract
      // text on failure — two model calls, one run.
      generateContent
        .mockResolvedValueOnce({
          text: '{"title":"Example"}',
          usageMetadata: { promptTokenCount: 1500, candidatesTokenCount: 300 },
        })
        .mockResolvedValueOnce({
          text: '{"title":"Example"}',
          usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 },
        });

      const ctx = trackedCtx();
      await service.getCapsuleProposalInfoFromImage(
        ctx,
        Buffer.from('fake-image'),
        'image/png',
      );
      await service.getCapsuleProposalInfo(ctx, 'fallback text');

      expect(ctx.tokens.promptTokens).toBe(2400);
      expect(ctx.tokens.completionTokens).toBe(420);
    });

    // Pinned to the legacy arm. With adversarialSummary on, a non-JSON mock
    // takes the corrective retry and then the legacy fallback — three calls, so
    // the assertion below would read 270 and stop testing accumulation.
    it('accumulates token usage from the analysis summary', async () => {
      generateContent.mockResolvedValue({
        text: 'A three sentence summary.',
        usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 90 },
      });

      const ctx = {
        ...ctxWith({ adversarialSummary: false }),
        tokens: { promptTokens: 0, completionTokens: 0, recorded: false },
      } as AiRunContext;
      await service.generateStartupAnalysisSummary(ctx, {
        title: 'T',
        description: 'D',
        problemStatement: 'P',
        targetMarket: 'M',
        solutionDescription: 'S',
        objectives: ['O'],
        proposalScope: 'Sc',
        methodology: 'Me',
        intellectualPropertyStatus: 'None',
      } as any);

      expect(ctx.tokens.completionTokens).toBe(90);
      expect(ctx.tokens.recorded).toBe(true);
    });
  });
});

// Characterisation tests, not behaviour tests. They pin the shipped prompt so
// the next task cannot alter the baseline arm while adding the adversarial one.
describe('LEGACY_SUMMARY_PROMPT', () => {
  // Values are distinctive on purpose. Single-character fixtures made the
  // interpolation test vacuous: 'T' matches "Title: ", 'P' matches "Please
  // provide", so five of nine needles passed with nothing interpolated.
  const dto = {
    title: 'TITLE_X1',
    description: 'DESC_X2',
    problemStatement: 'PROBLEM_X3',
    targetMarket: 'MARKET_X4',
    solutionDescription: 'SOLUTION_X5',
    objectives: ['OBJ_X6', 'OBJ_X7'],
    proposalScope: 'SCOPE_X8',
    methodology: 'METHOD_X9',
    historicalTimeline: [{ monthYear: 'MONTH_X10', description: 'HIST_X11' }],
    competitiveAdvantageAnalysis: [
      {
        competitorName: 'COMP_X12',
        offer: 'OFFER_X13',
        pricingStrategy: 'PRICE_X14',
      },
    ],
    intellectualPropertyStatus: 'IP_X15',
  } as StartupApplicationDto;

  // Golden value, generated from the shipped constant, not hand-typed. Written
  // as lines joined with '\n' so the two trailing-whitespace lines live inside
  // string literals where no formatter can strip them. Template-literal values
  // normalise CRLF to LF, so this holds regardless of on-disk line endings.
  const EXPECTED = [
    'Please provide a comprehensive analysis of the following startup proposal:',
    '',
    '      Title: TITLE_X1',
    '      Description: DESC_X2',
    '      Problem Statement: PROBLEM_X3',
    '      Target Market: MARKET_X4',
    '      Solution Description: SOLUTION_X5',
    '      Objectives: OBJ_X6',
    'OBJ_X7',
    '      Proposal Scope: SCOPE_X8',
    '      Methodology: METHOD_X9',
    '      Historical Timeline: MONTH_X10: HIST_X11',
    '      Competitive Advantage Analysis: Competitor: COMP_X12',
    '         Offer: OFFER_X13',
    '         Pricing Strategy: PRICE_X14',
    '      Intellectual Property Status: IP_X15',
    '',
    '      Analyze the startup proposal and provide a concise three-sentence summary that covers:',
    '      1. Overall viability assessment (market potential and solution strength)',
    '      2. Key competitive advantages and growth strategy feasibility',
    '      3. Critical risks and primary recommendations',
    '      ',
    '      Important: ',
    '      - Provide exactly three sentences',
    '      - Start directly with the analysis, no introductory phrases',
    "      - Be clear and direct about the startup's potential",
    '      - Focus on the most impactful insights',
    '      - Keep output concise while covering essential points',
  ].join('\n');

  // This is the assertion that actually enforces the doc comment's "do not
  // edit". The substring tests below document intent but survive gutting most
  // of the prompt, so they cannot police a frozen baseline on their own.
  it('renders exactly the text that shipped, to the byte', () => {
    expect(LEGACY_SUMMARY_PROMPT(dto)).toBe(EXPECTED);
  });

  it('still asks for the three original numbered items in order', () => {
    const p = LEGACY_SUMMARY_PROMPT(dto);
    const viability = p.indexOf('Overall viability assessment');
    const advantages = p.indexOf('Key competitive advantages');
    const risks = p.indexOf('Critical risks');
    expect(viability).toBeGreaterThan(-1);
    expect(advantages).toBeGreaterThan(viability);
    expect(risks).toBeGreaterThan(advantages);
  });

  it('still requests exactly three sentences', () => {
    expect(LEGACY_SUMMARY_PROMPT(dto)).toContain(
      'Provide exactly three sentences',
    );
  });

  it('interpolates every field the shipped prompt read', () => {
    const p = LEGACY_SUMMARY_PROMPT(dto);
    for (const v of [
      'TITLE_X1',
      'DESC_X2',
      'PROBLEM_X3',
      'MARKET_X4',
      'SOLUTION_X5',
      'OBJ_X6',
      'OBJ_X7',
      'SCOPE_X8',
      'METHOD_X9',
      'MONTH_X10',
      'HIST_X11',
      'COMP_X12',
      'OFFER_X13',
      'PRICE_X14',
      'IP_X15',
    ]) {
      expect(p).toContain(v);
    }
  });
});

describe('generateStartupAnalysisSummary — adversarial arm (SO 4.2)', () => {
  let service: AiService;
  let generateContent: jest.Mock;

  const dto = {
    title: 'AgroLink',
    description: 'A marketplace for smallholder farmers',
    problemStatement: 'Middlemen capture most of the margin',
    targetMarket: 'Smallholder farmers in Region VII',
    solutionDescription: 'A mobile app matching farmers to buyers',
    objectives: ['Onboard 500 farmers'],
    proposalScope: 'Cebu province',
    methodology: 'Agile, three sprints',
    intellectualPropertyStatus: 'None filed',
  } as StartupApplicationDto;

  const structuredResponse = (payload: unknown) => ({
    text: JSON.stringify(payload),
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
  });

  beforeEach(() => {
    generateContent = jest.fn();

    service = new AiService(
      { get: jest.fn() } as unknown as ConfigService,
      { recordFailure: jest.fn().mockResolvedValue(undefined) } as unknown as AiMetricsService,
      { normalizeScore: jest.fn().mockResolvedValue({ scaled: 5, z: 0 }) } as any,
      {} as any,
      new AiConfigService(undefinedConfigService),
      { indexRagContext: jest.fn().mockResolvedValue(true) } as any,
      { embed: jest.fn().mockResolvedValue(null) } as any,
    );

    (service as unknown as { ai: { models: { generateContent: jest.Mock } } }).ai = {
      models: { generateContent },
    } as any;
  });

  it('emits the legacy prompt unchanged when the flag is off', async () => {
    generateContent.mockResolvedValue({ text: 'A three sentence summary.' });

    const result = await service.generateStartupAnalysisSummary(
      ctxWith({ adversarialSummary: false }),
      dto,
    );

    expect(generateContent).toHaveBeenCalledTimes(1);
    const request = generateContent.mock.calls[0][0];
    expect(request.contents).toContain('Overall viability assessment');
    expect(request.config).not.toHaveProperty('responseSchema');
    expect(request.config).not.toHaveProperty('responseMimeType');
    expect(result).toEqual({
      summary: 'A three sentence summary.',
      unmetCriteria: [],
      criticalRisks: [],
    });
  });

  it('sends a schema-constrained request when the flag is on', async () => {
    generateContent.mockResolvedValue(
      structuredResponse({ unmet_criteria: [], critical_risks: [], summary: 'S.' }),
    );

    await service.generateStartupAnalysisSummary(ctxWith({ adversarialSummary: true }), dto);

    const request = generateContent.mock.calls.at(-1)![0];
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseSchema).toBeDefined();
    // The adversarial arm must not silently inherit the legacy instruction.
    expect(request.contents).not.toContain('Overall viability assessment');
  });

  // Field order IS the mechanism. If summary can precede unmet_criteria in the
  // schema, the model may write its conclusion first and the objective is unmet.
  it('orders unmet_criteria before summary in the schema', async () => {
    generateContent.mockResolvedValue(
      structuredResponse({ unmet_criteria: [], critical_risks: [], summary: 'S.' }),
    );

    await service.generateStartupAnalysisSummary(ctxWith({ adversarialSummary: true }), dto);

    const schema = generateContent.mock.calls.at(-1)![0].config.responseSchema;
    const props = Object.keys(schema.properties);
    expect(props.indexOf('unmet_criteria')).toBeLessThan(props.indexOf('summary'));
    expect(props.indexOf('critical_risks')).toBeLessThan(props.indexOf('summary'));
    // Gemini honours declaration order only when propertyOrdering says so; the
    // key order above is not transported by JSON serialization on its own.
    expect(schema.propertyOrdering).toEqual([
      'unmet_criteria',
      'critical_risks',
      'summary',
    ]);
  });

  it('returns parsed criteria alongside the summary', async () => {
    generateContent.mockResolvedValue(
      structuredResponse({
        unmet_criteria: [
          {
            criterion: 'No revenue evidence',
            proposal_field: 'historicalTimeline',
            why_unmet: 'no figure given',
          },
        ],
        critical_risks: [{ risk: 'Buyer demand unvalidated', severity: 'high' }],
        summary: 'Three sentence summary.',
      }),
    );

    const r = await service.generateStartupAnalysisSummary(
      ctxWith({ adversarialSummary: true }),
      dto,
    );

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(r.summary).toBe('Three sentence summary.');
    expect(r.unmetCriteria[0].proposalField).toBe('historicalTimeline');
    expect(r.unmetCriteria[0].whyUnmet).toBe('no figure given');
    expect(r.criticalRisks[0].severity).toBe('high');
  });

  // Spec §6: getCapsuleProposalInfo's parse failure hands the founder a blank
  // extraction screen with only a console.error. A schema failure here must
  // degrade to today's behaviour, never to nothing.
  it('falls back to the legacy free-text call when the schema call cannot be parsed', async () => {
    generateContent
      .mockResolvedValueOnce({ text: 'not json' })
      .mockResolvedValueOnce({ text: 'still not json' })
      .mockResolvedValueOnce({ text: 'Legacy summary text.' });

    const r = await service.generateStartupAnalysisSummary(
      ctxWith({ adversarialSummary: true }),
      dto,
    );

    // Bounded at 3: two schema attempts, then one legacy call.
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(generateContent.mock.calls[2][0].contents).toContain(
      'Overall viability assessment',
    );
    expect(generateContent.mock.calls[2][0].config).not.toHaveProperty('responseSchema');
    expect(r.summary).toBe('Legacy summary text.');
    expect(r.unmetCriteria).toEqual([]);
    expect(r.criticalRisks).toEqual([]);
  });

  // The generation-config passthrough added for this method runs through
  // generate()/callAiExpectJson(), which five other call sites share. Their
  // request object must stay byte-identical to what shipped.
  it('leaves the request of an existing callAiExpectJson caller unchanged', async () => {
    generateContent.mockResolvedValue({
      text: '[{"readiness_level_type":"Technology","rna":"Ship a prototype"}]',
    });

    await service.generateRNAsFromPrompt(ctxWith({ temperature: 0.4 }), 'prompt');

    const request = generateContent.mock.calls[0][0];
    expect(request.config).toEqual({ temperature: 0.4 });
    expect(request.config).not.toHaveProperty('responseMimeType');
    expect(request.config).not.toHaveProperty('responseSchema');
  });
});
