import { RnaService } from './rna.service';
import { AiRunService } from 'src/ai/ai-run.service';
import { Startup } from 'src/entities/startup.entity';
import { StartupRNA } from 'src/entities/rna.entity';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';
import { AiRecommendation } from 'src/entities/ai-recommendation.entity';
import { OutputValidatorService } from './output-validator.service';

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
      new OutputValidatorService(),
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

describe('RnaService.generateRNA output validation (Objective 1c)', () => {
  // Returns the aiService mock so each test can assert on it. `rna` is the
  // text the model is pretended to have produced.
  const runGenerate = async (rna: string) => {
    const startup = {
      id: 1,
      name: 'AgroLink',
      capsuleProposal: { title: 't', description: 'd' },
    };
    const readinessLevel = { id: 100, readinessType: 'Technology', level: 3 };
    const startupReadinessLevel = { id: 200, readinessLevel };
    const persisted: any[] = [];

    const em = {
      findOne: jest.fn((entity: any) =>
        Promise.resolve(entity === Startup ? startup : null),
      ),
      find: jest.fn((entity: any) => {
        if (entity === StartupRNA) return Promise.resolve([]);
        if (entity === StartupReadinessLevel)
          return Promise.resolve([startupReadinessLevel]);
        return Promise.resolve([]);
      }),
      persist: jest.fn((e) => {
        persisted.push(e);
        return e;
      }),
      flush: jest.fn().mockResolvedValue(undefined),
    };

    const aiService = {
      generateRNAsFromPrompt: jest
        .fn()
        .mockResolvedValue([{ readiness_level_type: 'Technology', rna }]),
      recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
    };

    const ragQueryService = {
      // lowConfidence: true is what makes this the low-confidence case, and it
      // also routes generateRNA down its fallback prompt branch.
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
      {} as any, // GroundedPromptBuilderService, unused on the fallback path
      new OutputValidatorService(),
      buildAiRunService().aiRunService,
    );

    await service.generateRNA(1, ctx);
    return aiService;
  };

  it('records low-confidence when retrieval was low-confidence, not the literal', async () => {
    const aiService = await runGenerate('Validate demand with 10 interviews.');
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        confidenceStatus: 'low-confidence',
        validationStatus: 'validated',
        notes: null,
      }),
    );
  });

  it('flags an RNA longer than the 500 characters the prompt declares', async () => {
    const aiService = await runGenerate('x'.repeat(600));
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({
        validationStatus: 'flagged',
        notes: expect.stringContaining('500'),
      }),
    );
  });
});

describe('RnaService.getRNAbyId verdict join (Task 5)', () => {
  // `wrap(r).toObject()` returns `r` itself when `r` isn't a live MikroORM
  // entity (no `__helper`), so these mock rows need their own `toObject` —
  // the same shape a real hydrated entity's would produce.
  const buildRow = (overrides: Record<string, any>) => ({
    id: 1,
    rna: 'Validate demand with 10 interviews.',
    isAiGenerated: true,
    startup: { id: 1 },
    readinessLevel: { readinessType: 'Technology', level: 3 },
    generationRun: undefined,
    toObject() {
      const { toObject, ...rest } = this;
      return rest;
    },
    ...overrides,
  });

  it('returns null verdict fields for rows with no generation run', async () => {
    const row = buildRow({ generationRun: undefined });

    const em = {
      find: jest.fn((entity: any) => {
        if (entity === StartupRNA) return Promise.resolve([row]);
        if (entity === AiRecommendation) return Promise.resolve([]);
        return Promise.resolve([]);
      }),
    };

    const service = new RnaService(
      em as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const [result] = await service.getRNAbyId(1);
    expect(result.validationStatus).toBeNull();
    expect(result.confidenceStatus).toBeNull();
  });

  it('joins the recorded verdict onto the matching generated row, filtered to RNA (would catch a dropped recommendationKind filter)', async () => {
    const row = buildRow({
      generationRun: { id: 7 },
      readinessLevel: { readinessType: 'Technology', level: 3 },
    });

    // Same (generationRun.id, dimensionKey) key, but recorded under 'RNS' —
    // a startup has both kinds against the same run. If the join query
    // dropped its `recommendationKind: 'RNA'` filter, this row would leak in
    // and (being inserted second, so it wins the Map's overwrite) flip the
    // asserted status.
    const rnaRec = {
      generationRun: { id: 7 },
      dimensionKey: 'Technology',
      recommendationKind: 'RNA',
      validationStatus: 'flagged',
      confidenceStatus: 'high-confidence',
      notes: 'too long',
    };
    const rnsRecSameKey = {
      generationRun: { id: 7 },
      dimensionKey: 'Technology',
      recommendationKind: 'RNS',
      validationStatus: 'validated',
      confidenceStatus: 'high-confidence',
      notes: null,
    };

    const em = {
      find: jest.fn((entity: any, filter?: any) => {
        if (entity === StartupRNA) return Promise.resolve([row]);
        if (entity === AiRecommendation) {
          const all = [rnaRec, rnsRecSameKey];
          const filtered = filter?.recommendationKind
            ? all.filter((r) => r.recommendationKind === filter.recommendationKind)
            : all;
          return Promise.resolve(filtered);
        }
        return Promise.resolve([]);
      }),
    };

    const service = new RnaService(
      em as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const [result] = await service.getRNAbyId(1);
    expect(result.validationStatus).toBe('flagged');
  });

  it('still returns the fields the frontend already consumes', async () => {
    const row = buildRow({ generationRun: undefined });

    const em = {
      find: jest.fn((entity: any) => {
        if (entity === StartupRNA) return Promise.resolve([row]);
        if (entity === AiRecommendation) return Promise.resolve([]);
        return Promise.resolve([]);
      }),
    };

    const service = new RnaService(
      em as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const [result] = await service.getRNAbyId(1);
    expect(result).toEqual(
      expect.objectContaining({
        id: expect.anything(),
        rna: expect.anything(),
        isAiGenerated: expect.anything(),
        readinessLevel: expect.anything(),
      }),
    );
  });
});
