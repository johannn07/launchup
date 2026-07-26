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
    expect(request.config).toEqual(
      expect.objectContaining({ temperature: 0, maxOutputTokens: expect.any(Number) }),
    );
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('maxOutputTokens');
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
    expect(request.config).toEqual(
      expect.objectContaining({ temperature: 0, maxOutputTokens: expect.any(Number) }),
    );
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('maxOutputTokens');
  });

  it('sends the configured model and sampling params inside config for image OCR calls', async () => {
    generateContent.mockResolvedValue({ text: '{"title":"Example"}' });

    await service.getCapsuleProposalInfoFromImage(Buffer.from('fake-image'), 'image/png');

    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-2.5-flash-lite');
    expect(request.config).toEqual(
      expect.objectContaining({ temperature: 0, maxOutputTokens: expect.any(Number) }),
    );
    expect(request).not.toHaveProperty('temperature');
    expect(request).not.toHaveProperty('maxOutputTokens');
  });
});
