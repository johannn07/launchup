import { RnsService } from './rns.service';
import { AiRunService } from 'src/ai/ai-run.service';
import { Startup } from 'src/entities/startup.entity';
import { StartupRNA } from 'src/entities/rna.entity';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';
import { ReadinessLevel } from 'src/entities/readiness-level.entity';
import { Rns } from 'src/entities/rns.entity';

// `generateTasks` requires `dto.rnaIds`, builds its prompt inline (falling
// back to a hand-built template on low-confidence RAG), calls
// `queryVectorDatabase` unconditionally, and creates each Rns via `new Rns()`
// + `em.persist()` — the mocks below match that shape.

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

describe('RnsService.generateTasks provenance', () => {
  it('stamps generated RNS rows, recommendations, and bias audits with the run id', async () => {
    const persisted: any[] = [];

    const startup = {
      id: 1,
      name: 'AgroLink',
      user: { id: 7 },
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
      id: 10,
      rna: 'Validate demand with 10 customer interviews.',
      readinessLevel: { readinessType: 'Technology', level: 3 },
    };

    const targetLevel = { id: 42, readinessType: 'Technology', level: 4 };

    // Keyed by entity class, not call order, so reordering an unrelated query
    // inside generateTasks doesn't break this test.
    const em = {
      findOne: jest.fn((entity: any) => {
        if (entity === Startup) return Promise.resolve(startup);
        if (entity === ReadinessLevel) return Promise.resolve(targetLevel);
        return Promise.resolve(null);
      }),
      find: jest.fn((entity: any) => {
        if (entity === StartupRNA) return Promise.resolve([rna]);
        if (entity === StartupReadinessLevel) return Promise.resolve([]);
        if (entity === Rns) return Promise.resolve([]);
        return Promise.resolve([]);
      }),
      create: jest.fn((_e, data) => data),
      persist: jest.fn((entity) => {
        persisted.push(entity);
        return entity;
      }),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
      getReference: jest.fn((_e, id) => ({ id })),
    };

    const aiService = {
      generateTasksFromPrompt: jest
        .fn()
        .mockResolvedValue([{ target_level: 3, description: 'Validate demand' }]),
      reviewBiasScore: jest
        .fn()
        .mockResolvedValue({ correctedScore: 3, biasFlagged: false, justification: '' }),
      recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
      recordBiasAudit: jest.fn().mockResolvedValue(undefined),
    };

    const ragQueryService = {
      // Low-confidence result routes generateTasks through its inline
      // fallback prompt builder rather than GroundedPromptBuilderService.
      queryVectorDatabase: jest.fn().mockResolvedValue({ lowConfidence: true }),
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

    // RnsService injects four dependencies; GroundedPromptBuilderService is
    // unused on this low-confidence-RAG path.
    const service = new RnsService(
      em as any,
      aiService as any,
      ragQueryService as any,
      {} as any, // GroundedPromptBuilderService
      buildAiRunService().aiRunService,
    );
    await service.generateTasks(
      { startup_id: 1, rnaIds: [10], no_of_tasks_to_create: 1 } as any,
      ctx,
    );

    expect(aiService.generateTasksFromPrompt).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(
      persisted.some((row) => row.generationRun?.id === 99 || row.generationRun === ctx.run),
    ).toBe(true);

    // `generationRun?` is optional on both input types, so deleting either
    // call site compiles clean and passes without this assertion.
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ generationRun: ctx.run }),
    );
    expect(aiService.recordBiasAudit).toHaveBeenCalledWith(
      expect.objectContaining({ generationRun: ctx.run }),
    );
  });
});

describe('RnsService.refineRnsDescription provenance', () => {
  it('threads ctx into the AI call and attributes the run to the RNS startup', async () => {
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

    const rns = {
      id: 20,
      description: 'Old description',
      startup,
    };

    const em = {
      findOne: jest.fn((entity: any) => {
        if (entity === Rns) return Promise.resolve(rns);
        return Promise.resolve(null);
      }),
      find: jest.fn((entity: any) => {
        if (entity === StartupReadinessLevel) return Promise.resolve([]);
        return Promise.resolve([]);
      }),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
    };

    const aiService = {
      refineRnsDescription: jest.fn().mockResolvedValue({
        refinedDescription: 'New, punchier description',
        aiCommentary: 'Tightened the language.',
      }),
    };

    // The controller opens rns_refine runs with startupId: null (the only
    // route param is the Rns id), so `ctx.run.startup` starts unset here.
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
    const service = new RnsService(
      em as any,
      aiService as any,
      {} as any,
      {} as any,
      aiRunService,
    );

    const result = await service.refineRnsDescription(20, [], 'Make it punchier', ctx);

    expect(aiService.refineRnsDescription).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(ctx.run.startup).toBe(startup);
    expect(forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 55 },
      { startup: startup.id },
    );
    expect(result.refinedDescription).toBe('New, punchier description');
  });
});

describe('RnsService dimension-level lookup (Finding 3 — keyed, not positional)', () => {
  const srl = (readinessType: string, level: number) => ({ readinessLevel: { readinessType, level } });

  // Mirrors ai.service.spec.ts's scrambled-order test: neither
  // em.find(StartupReadinessLevel) call site has an orderBy, so a positional
  // read would mislabel dimensions. Every dimension is scrambled here.
  const scrambledLevels = [
    srl('Investment', 6),
    srl('Acceptance', 2),
    srl('Technology', 9),
    srl('Regulatory', 4),
    srl('Market', 1),
    srl('Organizational', 7),
  ];

  it('generateTasks labels each dimension by its ReadinessType in the fallback prompt, not by array position', async () => {
    const startup = {
      id: 1,
      name: 'AgroLink',
      user: { id: 7 },
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
    const rna = { id: 10, rna: 'RNA text', readinessLevel: { readinessType: 'Technology', level: 3 } };
    const targetLevel = { id: 42, readinessType: 'Technology', level: 4 };

    const em = {
      findOne: jest.fn((entity: any) => {
        if (entity === Startup) return Promise.resolve(startup);
        if (entity === ReadinessLevel) return Promise.resolve(targetLevel);
        return Promise.resolve(null);
      }),
      find: jest.fn((entity: any) => {
        if (entity === StartupRNA) return Promise.resolve([rna]);
        if (entity === StartupReadinessLevel) return Promise.resolve(scrambledLevels);
        if (entity === Rns) return Promise.resolve([]);
        return Promise.resolve([]);
      }),
      create: jest.fn((_e, data) => data),
      persist: jest.fn(),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
      getReference: jest.fn((_e, id) => ({ id })),
    };

    const aiService = {
      generateTasksFromPrompt: jest.fn().mockResolvedValue([{ target_level: 4, description: 'x' }]),
      reviewBiasScore: jest
        .fn()
        .mockResolvedValue({ correctedScore: 4, biasFlagged: false, justification: '' }),
      recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
      recordBiasAudit: jest.fn().mockResolvedValue(undefined),
    };

    // lowConfidence: true routes generateTasks through the hand-built fallback
    // template, which embeds trl/mrl/arl/orl/rrl/irl directly.
    const ragQueryService = {
      queryVectorDatabase: jest.fn().mockResolvedValue({ lowConfidence: true }),
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

    const service = new RnsService(
      em as any,
      aiService as any,
      ragQueryService as any,
      {} as any,
      buildAiRunService().aiRunService,
    );

    await service.generateTasks(
      { startup_id: 1, rnaIds: [10], no_of_tasks_to_create: 1 } as any,
      ctx,
    );

    const prompt = aiService.generateTasksFromPrompt.mock.calls[0][1];
    expect(prompt).toContain('TRL 9');
    expect(prompt).toContain('MRL 1');
    expect(prompt).toContain('ARL 2');
    expect(prompt).toContain('ORL 7');
    expect(prompt).toContain('RRL 4');
    expect(prompt).toContain('IRL 6');
  });

  it('refineRnsDescription labels each dimension by its ReadinessType, not by array position', async () => {
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
    const rns = { id: 20, description: 'Old description', startup };

    const em = {
      findOne: jest.fn((entity: any) => {
        if (entity === Rns) return Promise.resolve(rns);
        return Promise.resolve(null);
      }),
      find: jest.fn((entity: any) => {
        if (entity === StartupReadinessLevel) return Promise.resolve(scrambledLevels);
        return Promise.resolve([]);
      }),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
    };

    const aiService = {
      refineRnsDescription: jest
        .fn()
        .mockResolvedValue({ refinedDescription: 'new', aiCommentary: 'ok' }),
    };

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

    const { aiRunService } = buildAiRunService();
    const service = new RnsService(em as any, aiService as any, {} as any, {} as any, aiRunService);

    await service.refineRnsDescription(20, [], 'Make it punchier', ctx);

    const prompt = aiService.refineRnsDescription.mock.calls[0][1];
    expect(prompt).toContain('TRL 9');
    expect(prompt).toContain('MRL 1');
    expect(prompt).toContain('ARL 2');
    expect(prompt).toContain('ORL 7');
    expect(prompt).toContain('RRL 4');
    expect(prompt).toContain('IRL 6');
  });
});

describe('RnsService.generateTasks per-dimension rubric scoping (Finding 6)', () => {
  it('filters verifiedFrameworks to the current dimension before each per-RNA grounded prompt', async () => {
    const startup = {
      id: 1,
      name: 'AgroLink',
      user: { id: 7 },
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

    const rnaTech = { id: 10, rna: 'Tech RNA', readinessLevel: { readinessType: 'Technology', level: 3 } };
    const rnaMarket = { id: 11, rna: 'Market RNA', readinessLevel: { readinessType: 'Market', level: 2 } };
    const targetLevel = { id: 42, readinessType: 'Technology', level: 4 };

    const em = {
      findOne: jest.fn((entity: any) => {
        if (entity === Startup) return Promise.resolve(startup);
        if (entity === ReadinessLevel) return Promise.resolve(targetLevel);
        return Promise.resolve(null);
      }),
      find: jest.fn((entity: any) => {
        if (entity === StartupRNA) return Promise.resolve([rnaTech, rnaMarket]);
        if (entity === StartupReadinessLevel) return Promise.resolve([]);
        if (entity === Rns) return Promise.resolve([]);
        return Promise.resolve([]);
      }),
      create: jest.fn((_e, data) => data),
      persist: jest.fn(),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
      flush: jest.fn().mockResolvedValue(undefined),
      getReference: jest.fn((_e, id) => ({ id })),
    };

    const aiService = {
      generateTasksFromPrompt: jest.fn().mockResolvedValue([{ target_level: 4, description: 'do a thing' }]),
      reviewBiasScore: jest
        .fn()
        .mockResolvedValue({ correctedScore: 4, biasFlagged: false, justification: '' }),
      recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
      recordBiasAudit: jest.fn().mockResolvedValue(undefined),
    };

    // One queryVectorDatabase call for the whole batch, as the real code does
    // — the shape that used to leak unfiltered into every per-RNA prompt.
    const ragContext = {
      lowConfidence: false,
      verifiedFrameworks: [
        { title: 'TRL 3', content: 'trl text', readinessType: 'Technology' },
        { title: 'MRL 2', content: 'mrl text', readinessType: 'Market' },
      ],
      businessModels: [],
      similarProfiles: [],
    };

    const ragQueryService = {
      queryVectorDatabase: jest.fn().mockResolvedValue(ragContext),
    };

    const groundedPromptBuilderService = {
      buildGroundedPrompt: jest.fn().mockReturnValue('grounded prompt'),
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

    const service = new RnsService(
      em as any,
      aiService as any,
      ragQueryService as any,
      groundedPromptBuilderService as any,
      buildAiRunService().aiRunService,
    );

    await service.generateTasks(
      { startup_id: 1, rnaIds: [10, 11], no_of_tasks_to_create: 1 } as any,
      ctx,
    );

    expect(groundedPromptBuilderService.buildGroundedPrompt).toHaveBeenCalledTimes(2);

    const [techCall, marketCall] = groundedPromptBuilderService.buildGroundedPrompt.mock.calls;
    expect(techCall[0].verifiedFrameworks).toEqual([
      expect.objectContaining({ readinessType: 'Technology' }),
    ]);
    expect(marketCall[0].verifiedFrameworks).toEqual([
      expect.objectContaining({ readinessType: 'Market' }),
    ]);
  });
});
