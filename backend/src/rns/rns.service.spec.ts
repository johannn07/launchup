import { RnsService } from './rns.service';
import { AiRunService } from 'src/ai/ai-run.service';
import { Startup } from 'src/entities/startup.entity';
import { StartupRNA } from 'src/entities/rna.entity';
import { StartupReadinessLevel } from 'src/entities/startup-readiness-level.entity';
import { ReadinessLevel } from 'src/entities/readiness-level.entity';
import { Rns } from 'src/entities/rns.entity';

// NOTE ON THIS TEST FILE: the brief's Step 1 test assumed a `generateTasks`
// that (a) calls `aiService.createBasePrompt` for its prompt text, (b)
// accepts a bare `{ startup_id }` dto with no `rnaIds`, and (c) creates Rns
// rows via `em.create`. The real implementation on disk does none of those
// things: it requires `dto.rnaIds`, builds its prompt inline (falling back
// to a hand-built template when RAG context is low-confidence), calls
// `ragQueryService.queryVectorDatabase` unconditionally, and creates each
// Rns via `new Rns()` + `em.persist()`. Per Ruling 3, the mocks and
// assertions below are adjusted to match the real control flow while
// preserving the original intent: verify `ctx` is threaded into every AI
// call and that generated rows/records are stamped with the run.

// A *real* AiRunService over a stub EntityManager, so these tests exercise
// the actual durable-attribution write rather than a mock that only mutates
// ctx.run in memory.
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

    // Keyed by entity class rather than call order: reordering an unrelated
    // query inside generateTasks should not make this test fail for an
    // unrelated reason.
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

    // Only the Rns stamping had compiler/test backstop before this fix:
    // `generationRun?` is optional on both input types below, so deleting
    // either call site would previously compile clean and still pass.
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

    // The controller opens rns_refine runs with startupId: null, since the
    // only route param is the Rns id. `ctx.run.startup` starts unset here
    // to mirror that, and the assertion below is what proves the service
    // fixes it up once the startup is loaded (Important 3 / Ruling 1).
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
