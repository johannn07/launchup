import { RnaService } from './rna.service';
import { AiRunService } from 'src/ai/ai-run.service';
import { Startup } from 'src/entities/startup.entity';
import { StartupRNA } from 'src/entities/rna.entity';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';

// `generateRNA` always queries queryVectorDatabase but only calls
// buildGroundedPrompt when `!ragContext.lowConfidence`. These tests take the
// low-confidence path (all three channels empty), which routes through
// createBasePrompt — so groundedPromptBuilderService can stay `{} as any`.

// A *real* AiRunService over a stub EntityManager, so these tests exercise the
// durable-attribution write rather than a mock that only mutates ctx.run.
function buildAiRunService() {
  const forkedEm = { nativeUpdate: jest.fn().mockResolvedValue(1) };
  const service = new AiRunService(
    { fork: () => forkedEm } as any,
    {} as any, // AiConfigService, unused by attribute()
  );
  return { aiRunService: service, forkedEm };
}

describe('RnaService.generateRNA provenance', () => {
  it('threads ctx into the AI call and stamps generated rows and recommendations with the run', async () => {
    const persisted: any[] = [];

    const startup = {
      id: 1,
      name: 'AgroLink',
      capsuleProposal: {
        title: 't',
        description: 'd',
        problemStatement: 'p',
        targetMarket: 'm',
        solutionDescription: 's',
        objectives: 'o',
        scope: 'sc',
        methodology: 'me',
      },
    };

    const readinessLevel = { id: 100, readinessType: 'Technology', level: 3 };
    const startupReadinessLevel = { id: 200, readinessLevel };

    // Keyed by entity class, not call order, so reordering an unrelated
    // query inside generateRNA doesn't break this test for an unrelated
    // reason.
    const em = {
      findOne: jest.fn((entity: any) => {
        if (entity === Startup) return Promise.resolve(startup);
        return Promise.resolve(null);
      }),
      find: jest.fn((entity: any) => {
        if (entity === StartupRNA) return Promise.resolve([]); // no existing RNA yet
        if (entity === StartupReadinessLevel)
          return Promise.resolve([startupReadinessLevel]);
        return Promise.resolve([]);
      }),
      persist: jest.fn((entity) => {
        persisted.push(entity);
        return entity;
      }),
      flush: jest.fn().mockResolvedValue(undefined),
    };

    const aiService = {
      generateRNAsFromPrompt: jest.fn().mockResolvedValue([
        {
          readiness_level_type: 'Technology',
          rna: 'Validate demand with 10 customer interviews.',
        },
      ]),
      recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
      // Exercised by the fallback branch below (createBasePrompt is what
      // generateRNA calls when the RAG context is low-confidence).
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
    };

    const ragQueryService = {
      // Low-confidence result routes generateRNA through its fallback prompt
      // builder (aiService.createBasePrompt) rather than
      // GroundedPromptBuilderService.
      queryVectorDatabase: jest.fn().mockResolvedValue({
        lowConfidence: true,
        verifiedFrameworks: [],
        businessModels: [],
        similarProfiles: [],
      }),
    };

    const ctx = {
      runId: 99,
      run: {} as any,
      config: Object.freeze({
        model: 'gemini-2.5-flash-lite',
        temperature: 0,
        grounding: true,
        rag: true,
        biasReview: true,
        scoreNormalization: true,
      }),
    } as any;

    const service = new RnaService(
      em as any,
      aiService as any,
      ragQueryService as any,
      {} as any, // GroundedPromptBuilderService, unused on this fallback path
      {} as any, // OutputValidatorService, unused by generateRNA
      {} as any, // RecommendationStorageService, unused by generateRNA
      buildAiRunService().aiRunService,
    );

    await service.generateRNA(1, ctx);

    expect(aiService.generateRNAsFromPrompt).toHaveBeenCalledWith(
      ctx,
      expect.any(String),
    );
    expect(persisted.some((row) => row.generationRun === ctx.run)).toBe(true);

    // `generationRun?` is optional on the recordAiRecommendation input type,
    // so an unasserted stamping would compile clean and pass silently if
    // deleted.
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ generationRun: ctx.run }),
    );
  });
});

describe('RnaService.generateRNA rubric-mode fallback (Finding 1)', () => {
  it('passes ctx.config.rubricMode through to createBasePrompt on the low-confidence fallback path', async () => {
    const startup = {
      id: 1,
      name: 'AgroLink',
      capsuleProposal: {
        title: 't',
        description: 'd',
        problemStatement: 'p',
        targetMarket: 'm',
        solutionDescription: 's',
        objectives: 'o',
        scope: 'sc',
        methodology: 'me',
      },
    };

    const readinessLevel = { id: 100, readinessType: 'Technology', level: 3 };
    const startupReadinessLevel = { id: 200, readinessLevel };

    const em = {
      findOne: jest.fn((entity: any) => {
        if (entity === Startup) return Promise.resolve(startup);
        return Promise.resolve(null);
      }),
      find: jest.fn((entity: any) => {
        if (entity === StartupRNA) return Promise.resolve([]);
        if (entity === StartupReadinessLevel) return Promise.resolve([startupReadinessLevel]);
        return Promise.resolve([]);
      }),
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    };

    const aiService = {
      generateRNAsFromPrompt: jest.fn().mockResolvedValue([]),
      recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
    };

    // A semantic-mode run whose retrieval genuinely came back empty (measured:
    // 0/12 against this corpus) — the fallback must tell createBasePrompt to
    // suppress its own deterministic rubric lookup rather than silently
    // relabelling a deterministic result as belonging to the semantic arm.
    const ragQueryService = {
      queryVectorDatabase: jest.fn().mockResolvedValue({
        lowConfidence: true,
        verifiedFrameworks: [],
        businessModels: [],
        similarProfiles: [],
      }),
    };

    const ctx = {
      runId: 99,
      run: {} as any,
      config: Object.freeze({
        model: 'gemini-2.5-flash-lite',
        temperature: 0,
        grounding: true,
        rag: true,
        ragCorpus: true,
        rubricMode: 'semantic',
        biasReview: true,
        scoreNormalization: true,
      }),
    } as any;

    const service = new RnaService(
      em as any,
      aiService as any,
      ragQueryService as any,
      {} as any,
      {} as any,
      {} as any,
      buildAiRunService().aiRunService,
    );

    await service.generateRNA(1, ctx);

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, startup, em, {
      rubricMode: 'semantic',
    });
  });
});

describe('RnaService.refineRna provenance', () => {
  it('threads ctx into the AI calls and attributes the run to the RNA startup', async () => {
    const startup = {
      id: 5,
      name: 'AgroLink',
      capsuleProposal: {
        title: 't',
        description: 'd',
        problemStatement: 'p',
        targetMarket: 'm',
        solutionDescription: 's',
        objectives: 'o',
        scope: 'sc',
        methodology: 'me',
      },
    };

    const rna = {
      id: 20,
      rna: 'Old RNA description',
      startup,
      readinessLevel: { readinessType: 'Technology', level: 3 },
    };

    const em = {
      findOne: jest.fn((entity: any) => {
        if (entity === StartupRNA) return Promise.resolve(rna);
        return Promise.resolve(null);
      }),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
    };

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      refineRna: jest.fn().mockResolvedValue({
        refinedRna: 'New, punchier RNA description',
        aiCommentary: 'Tightened the language.',
      }),
    };

    // The controller opens rna_refine runs with startupId: null, since the
    // only route param is the RNA id. `ctx.run.startup` starts unset here to
    // mirror that; the assertion below proves the service fixes it up once
    // the startup is loaded.
    const ctx = {
      runId: 55,
      run: { id: 55, startup: undefined } as any,
      tokens: { promptTokens: 0, completionTokens: 0, recorded: false },
      config: Object.freeze({
        model: 'gemini-2.5-flash-lite',
        temperature: 0,
        grounding: true,
        rag: true,
        biasReview: true,
        scoreNormalization: true,
      }),
    } as any;

    const { aiRunService, forkedEm } = buildAiRunService();
    const service = new RnaService(
      em as any,
      aiService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      aiRunService,
    );

    const result = await service.refineRna(20, [], 'Make it punchier', ctx);

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, startup, em);
    expect(aiService.refineRna).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(ctx.run.startup).toBe(startup);
    expect(forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 55 },
      { startup: startup.id },
    );
    expect(result.refinedRna).toBe('New, punchier RNA description');
  });
});
