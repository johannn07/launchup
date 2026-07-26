import { RnsService } from './rns.service';

// NOTE ON THIS TEST: the brief's Step 1 test assumed a `generateTasks` that
// (a) calls `aiService.createBasePrompt` for its prompt text, (b) accepts a
// bare `{ startup_id }` dto with no `rnaIds`, and (c) creates Rns rows via
// `em.create`. The real implementation on disk does none of those things:
// it requires `dto.rnaIds`, builds its prompt inline (falling back to a
// hand-built template when RAG context is low-confidence), calls
// `ragQueryService.queryVectorDatabase` unconditionally, and creates each
// Rns via `new Rns()` + `em.persist()`. Per Ruling 3, the mocks and
// assertions below are adjusted to match the real control flow while
// preserving the original intent: verify `ctx` is threaded into
// `generateTasksFromPrompt` and that generated rows are stamped with the
// run.
describe('RnsService.generateTasks provenance', () => {
  it('stamps generated RNS rows with the run id', async () => {
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

    const em = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce(startup) // Startup lookup
        .mockResolvedValueOnce(targetLevel), // ReadinessLevel lookup
      find: jest
        .fn()
        .mockResolvedValueOnce([rna]) // StartupRNA (rnasToGenerateFrom)
        .mockResolvedValueOnce([]) // StartupReadinessLevel
        .mockResolvedValueOnce([]), // existing Rns
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
    );
    await service.generateTasks(
      { startup_id: 1, rnaIds: [10], no_of_tasks_to_create: 1 } as any,
      ctx,
    );

    expect(aiService.generateTasksFromPrompt).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(
      persisted.some((row) => row.generationRun?.id === 99 || row.generationRun === ctx.run),
    ).toBe(true);
  });
});
