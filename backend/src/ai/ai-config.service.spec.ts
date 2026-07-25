import { ConfigService } from '@nestjs/config';
import { AiConfigService } from './ai-config.service';

const configFrom = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('AiConfigService', () => {
  it('parses a fully specified environment', () => {
    const service = new AiConfigService(
      configFrom({
        GEMINI_MODEL: 'gemini-2.5-pro',
        AI_TEMPERATURE: '0.4',
        AI_GROUNDING_ENABLED: 'false',
        AI_RAG_ENABLED: 'false',
        AI_BIAS_REVIEW_ENABLED: 'false',
        AI_SCORE_NORMALIZATION_ENABLED: 'false',
        AI_ALLOW_REQUEST_OVERRIDE: 'true',
      }),
    );

    expect(service.defaults).toEqual({
      model: 'gemini-2.5-pro',
      temperature: 0.4,
      grounding: false,
      rag: false,
      biasReview: false,
      scoreNormalization: false,
    });
    expect(service.allowRequestOverride).toBe(true);
  });

  it('applies defaults when variables are unset', () => {
    const service = new AiConfigService(configFrom({}));

    expect(service.defaults).toEqual({
      model: 'gemini-2.5-flash-lite',
      temperature: 0,
      grounding: true,
      rag: true,
      biasReview: true,
      scoreNormalization: true,
    });
    expect(service.allowRequestOverride).toBe(false);
  });

  it('accepts 1 and 0 as booleans', () => {
    const service = new AiConfigService(
      configFrom({ AI_RAG_ENABLED: '0', AI_GROUNDING_ENABLED: '1' }),
    );

    expect(service.defaults.rag).toBe(false);
    expect(service.defaults.grounding).toBe(true);
  });

  it('throws when temperature is not a number', () => {
    expect(() => new AiConfigService(configFrom({ AI_TEMPERATURE: 'warm' }))).toThrow(
      /AI_TEMPERATURE/,
    );
  });

  it('throws when temperature is out of range', () => {
    expect(() => new AiConfigService(configFrom({ AI_TEMPERATURE: '5' }))).toThrow(
      /AI_TEMPERATURE/,
    );
  });

  it('throws when the model is blank', () => {
    expect(() => new AiConfigService(configFrom({ GEMINI_MODEL: '' }))).toThrow(/GEMINI_MODEL/);
  });
});
