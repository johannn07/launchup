import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiMetricsService } from './ai-metrics.service';
import { BaselineService } from './baseline.service'; 

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

    await expect(service.generateRNAsFromPrompt('prompt')).resolves.toEqual([
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

    await expect(service.generateRNAsFromPrompt('prompt')).resolves.toEqual([]);

    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('passes valid task responses through unchanged', async () => {
    generateContent.mockResolvedValue({
      text: '[{"target_level":3,"description":"Validate the product hypothesis"}]',
    });

    await expect(service.generateTasksFromPrompt('prompt')).resolves.toEqual([
      {
        target_level: 3,
        description: 'Validate the product hypothesis',
        target_level_normalized: 3,   // ← added to match the normalized output
      },
    ]);

    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});