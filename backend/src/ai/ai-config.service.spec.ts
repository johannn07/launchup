import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
        AI_RAG_STRATEGY: 'keyword',
        AI_BIAS_REVIEW_ENABLED: 'false',
        AI_SCORE_NORMALIZATION_ENABLED: 'false',
        AI_ADVERSARIAL_SUMMARY_ENABLED: 'false',
        AI_ALLOW_REQUEST_OVERRIDE: 'true',
      }),
    );

    expect(service.defaults).toEqual({
      model: 'gemini-2.5-pro',
      temperature: 0.4,
      grounding: false,
      rag: false,
      ragStrategy: 'keyword',
      ragCorpus: true,
      rubricMode: 'deterministic',
      biasReview: false,
      scoreNormalization: false,
      adversarialSummary: false,
    });
    expect(service.allowRequestOverride).toBe(true);
  });

  it('applies defaults when variables are unset', () => {
    const service = new AiConfigService(configFrom({}));

    expect(service.defaults).toEqual({
      // A reasoning tier, deliberately. See DEFAULT_MODEL in
      // ai-config.service.ts for why it is not a lite tier and not Pro.
      model: 'gemini-3.6-flash',
      temperature: 0,
      grounding: true,
      rag: true,
      // Semantic by default: keyword matching is what this replaces, so
      // defaulting to it would make the enhanced arm opt-in.
      ragStrategy: 'semantic',
      ragCorpus: true,
      rubricMode: 'deterministic',
      biasReview: true,
      scoreNormalization: true,
      adversarialSummary: true,
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
    expect(
      () => new AiConfigService(configFrom({ AI_TEMPERATURE: 'warm' })),
    ).toThrow(/AI_TEMPERATURE/);
  });

  it('throws when temperature is out of range', () => {
    expect(
      () => new AiConfigService(configFrom({ AI_TEMPERATURE: '5' })),
    ).toThrow(/AI_TEMPERATURE/);
  });

  it('rejects an unknown retrieval strategy instead of falling back', () => {
    // A typo'd strategy that silently defaulted would mislabel which arm a
    // batch of generations actually ran under.
    expect(
      () => new AiConfigService(configFrom({ AI_RAG_STRATEGY: 'vector' })),
    ).toThrow(/AI_RAG_STRATEGY/);
  });

  it('keeps rag and ragStrategy independent', () => {
    // rag=false is "no retrieval at all"; the strategy still resolves so the
    // three arms stay distinguishable in ai_generation_runs.
    const service = new AiConfigService(
      configFrom({ AI_RAG_ENABLED: 'false', AI_RAG_STRATEGY: 'semantic' }),
    );

    expect(service.defaults.rag).toBe(false);
    expect(service.defaults.ragStrategy).toBe('semantic');
  });

  it('throws when the model is blank', () => {
    expect(() => new AiConfigService(configFrom({ GEMINI_MODEL: '' }))).toThrow(
      /GEMINI_MODEL/,
    );
  });
});

describe('AiConfigService.resolve', () => {
  const permissive = () =>
    new AiConfigService(configFrom({ AI_ALLOW_REQUEST_OVERRIDE: 'true' }));

  it('returns defaults when no override is supplied', () => {
    expect(permissive().resolve(undefined, true)).toEqual({
      model: 'gemini-3.6-flash',
      temperature: 0,
      grounding: true,
      rag: true,
      // Semantic by default: keyword matching is what this replaces, so
      // defaulting to it would make the enhanced arm opt-in.
      ragStrategy: 'semantic',
      ragCorpus: true,
      rubricMode: 'deterministic',
      biasReview: true,
      scoreNormalization: true,
      adversarialSummary: true,
    });
  });

  it('merges a partial override over the defaults', () => {
    const resolved = permissive().resolve('{"rag":false,"model":"gemini-2.5-pro"}', true);

    expect(resolved.rag).toBe(false);
    expect(resolved.model).toBe('gemini-2.5-pro');
    expect(resolved.grounding).toBe(true);
  });

  it('freezes the resolved config', () => {
    const resolved = permissive().resolve('{"rag":false}', true);
    expect(Object.isFrozen(resolved)).toBe(true);
  });

  it('rejects an override when the deployment disallows it', () => {
    const strict = new AiConfigService(configFrom({ AI_ALLOW_REQUEST_OVERRIDE: 'false' }));
    expect(() => strict.resolve('{"rag":false}', true)).toThrow(ForbiddenException);
  });

  it('rejects an override from an unprivileged caller', () => {
    expect(() => permissive().resolve('{"rag":false}', false)).toThrow(ForbiddenException);
  });

  it('rejects malformed JSON', () => {
    expect(() => permissive().resolve('not json', true)).toThrow(BadRequestException);
  });

  it('rejects unknown override fields', () => {
    expect(() => permissive().resolve('{"nope":true}', true)).toThrow(BadRequestException);
  });

  it('rejects an out-of-range temperature override', () => {
    expect(() => permissive().resolve('{"temperature":9}', true)).toThrow(BadRequestException);
  });
});

describe('corpus configuration', () => {
  const svc = (env: Record<string, string | undefined>) =>
    new AiConfigService({
      get: (key: string) => env[key],
    } as unknown as ConfigService);

  it('enables the corpus by default', () => {
    expect(svc({}).defaults.ragCorpus).toBe(true);
  });

  it('defaults the rubric mode to deterministic', () => {
    expect(svc({}).defaults.rubricMode).toBe('deterministic');
  });

  it('reads both from the environment', () => {
    const config = svc({
      AI_RAG_CORPUS_ENABLED: 'false',
      AI_RAG_RUBRIC_MODE: 'semantic',
    }).defaults;
    expect(config.ragCorpus).toBe(false);
    expect(config.rubricMode).toBe('semantic');
  });

  it('rejects an unrecognised rubric mode at boot rather than defaulting', () => {
    // A typo must not silently mislabel which mechanism produced a batch of
    // generations — that would make the arm comparison unattributable.
    expect(() => svc({ AI_RAG_RUBRIC_MODE: 'determinstic' })).toThrow(
      /Invalid AI pipeline configuration/,
    );
  });
});

describe('adversarialSummary flag (SO 4.2)', () => {
  it('defaults to true when the env var is unset', () => {
    expect(new AiConfigService(configFrom({})).defaults.adversarialSummary).toBe(true);
  });

  it('reads AI_ADVERSARIAL_SUMMARY_ENABLED', () => {
    const service = new AiConfigService(
      configFrom({ AI_ADVERSARIAL_SUMMARY_ENABLED: 'false' }),
    );
    expect(service.defaults.adversarialSummary).toBe(false);
  });

  it('accepts 0 and 1 like the other flags', () => {
    expect(
      new AiConfigService(configFrom({ AI_ADVERSARIAL_SUMMARY_ENABLED: '0' })).defaults
        .adversarialSummary,
    ).toBe(false);
  });

  it('honours a privileged per-request override', () => {
    const permissive = () =>
      new AiConfigService(configFrom({ AI_ALLOW_REQUEST_OVERRIDE: 'true' }));
    const resolved = permissive().resolve('{"adversarialSummary":false}', true);
    expect(resolved.adversarialSummary).toBe(false);
  });

  it('rejects an override from an unprivileged caller', () => {
    const permissive = () =>
      new AiConfigService(configFrom({ AI_ALLOW_REQUEST_OVERRIDE: 'true' }));
    expect(() => permissive().resolve('{"adversarialSummary":false}', false)).toThrow(
      ForbiddenException,
    );
  });
});
