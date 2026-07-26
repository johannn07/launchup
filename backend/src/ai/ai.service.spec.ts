import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiMetricsService } from './ai-metrics.service';
import { BaselineService } from './baseline.service';
import { AiRunContext } from './ai-run.service';
import { AiConfigService } from './ai-config.service';

// Same pattern as ai-config.service.spec.ts's `configFrom` — a `get` that
// always returns undefined so AiConfigService falls back to its documented
// defaults (model: 'gemini-2.5-flash-lite', temperature: 0, grounding: true).
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
    // No output cap anywhere: at the base commit these calls passed
    // maxOutputTokens at the top level, where the SDK dropped it, so nothing
    // was ever actually capped. Sending one now would be a new, unrequested
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

  it('falls back to the injected AiConfigService defaults for untracked (non-run) calls', async () => {
    generateContent.mockResolvedValue({ text: '{"title":"Example"}' });

    await service.getCapsuleProposalInfo('some proposal text');

    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-2.5-flash-lite');
    expect(request.config).toEqual(expect.objectContaining({ temperature: 0 }));
    expect(request).not.toHaveProperty('temperature');
    // Uncapped on purpose: this prompt asks for eight full prose fields from
    // a whole document, and a truncated response fails JSON.parse in
    // startup.service.ts, which shows the founder a blank review screen.
    expect(request.config).not.toHaveProperty('maxOutputTokens');
    expect(request).not.toHaveProperty('maxOutputTokens');
  });

  it('sends the configured model and sampling params inside config for image OCR calls', async () => {
    generateContent.mockResolvedValue({ text: '{"title":"Example"}' });

    await service.getCapsuleProposalInfoFromImage(Buffer.from('fake-image'), 'image/png');

    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-2.5-flash-lite');
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

    // The third arm of the ragBlock three-way, and the only one that had no
    // test. The literal "none found" is a deliberate anti-hallucination cue:
    // it tells the model retrieval ran and came back empty, rather than
    // leaving a silence the model is free to fill by inventing context.
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
});
