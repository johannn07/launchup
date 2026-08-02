import { RoadblockService } from './roadblock.service';
import { AiRunService } from 'src/ai/ai-run.service';
import { Startup } from 'src/entities/startup.entity';
import { Rns } from 'src/entities/rns.entity';
import { Initiative } from 'src/entities/initiative.entity';
import { Roadblock } from 'src/entities/roadblock.entity';

// A *real* AiRunService over a stub EntityManager. An earlier round of this
// fix passed while the row stayed startup_id NULL, precisely because the
// assertions stopped at ctx.run.
function buildAiRunService() {
  const forkedEm = { nativeUpdate: jest.fn().mockResolvedValue(1) };
  const service = new AiRunService(
    { fork: () => forkedEm } as any,
    {} as any, // AiConfigService, unused by attribute()
  );
  return { aiRunService: service, forkedEm };
}

// Unlike GenerateInitiativeDto, GenerateRoadblocksDto carries a startupId, so
// the controller passes it to track() and generateRoadblocks never backfills
// ctx.run.startup. refineRoadblock still does — its only route param is the
// roadblock id, mirroring InitiativeService.refineInitiative.
function buildCtx() {
  return {
    runId: 77,
    run: {} as any,
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
}

describe('RoadblockService.generateRoadblocks provenance', () => {
  function buildStartup(overrides: Record<string, any> = {}) {
    return {
      id: 1,
      name: 'AgroLink',
      capsuleProposal: { title: 't' },
      user: { id: 5 },
      ...overrides,
    } as any;
  }

  // Branches on entity class, not call order, so reordering an unrelated query
  // in the service doesn't break this test.
  function buildEm(startup: any, created: any[]) {
    return {
      findOneOrFail: jest.fn((entity: any, where: any) => {
        if (entity === Startup) {
          if (where.id === startup.id) return Promise.resolve(startup);
          return Promise.reject(new Error(`Startup ${where.id} not found`));
        }
        return Promise.reject(new Error(`Unexpected findOneOrFail(${entity})`));
      }),
      find: jest.fn((entity: any) => {
        if (entity === Rns) return Promise.resolve([]);
        if (entity === Initiative) return Promise.resolve([]);
        return Promise.resolve([]);
      }),
      persistAndFlush: jest.fn((entity) => {
        created.push(entity);
        return Promise.resolve(undefined);
      }),
    };
  }

  it('passes ctx to the AI calls (including bias review) and stamps generationRun on every generated row', async () => {
    const startup = buildStartup();
    const created: any[] = [];
    const em = buildEm(startup, created);

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      generateRoadblocksFromPrompt: jest
        .fn()
        .mockResolvedValue([{ description: 'No traction', fix: 'Run pilots', riskNumber: 4 }]),
      reviewBiasScore: jest
        .fn()
        .mockResolvedValue({ correctedScore: 4, biasFlagged: false, justification: '' }),
      recordAiRecommendation: jest.fn().mockResolvedValue(undefined),
      recordBiasAudit: jest.fn().mockResolvedValue(undefined),
    };

    const ctx = buildCtx();
    const { aiRunService } = buildAiRunService();
    const service = new RoadblockService(em as any, aiService as any, aiRunService);

    // The controller already attributed ctx.run.startup at begin() time from
    // dto.startupId; simulate that here.
    ctx.run.startup = startup;

    await service.generateRoadblocks(
      { startupId: 1, no_of_roadblocks_to_create: 1, debug: false } as any,
      ctx,
    );

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, startup, em);
    expect(aiService.generateRoadblocksFromPrompt).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(aiService.reviewBiasScore).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ dimensionKey: 'roadblock', rawScore: 4 }),
    );

    // generationRun? is optional on Roadblock, so reverting the stamping would
    // compile clean and pass without this assertion.
    expect(created.some((row) => row.generationRun === ctx.run)).toBe(true);

    // Likewise optional on recordAiRecommendation and recordBiasAudit.
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ generationRun: ctx.run }),
    );
    expect(aiService.recordBiasAudit).toHaveBeenCalledWith(
      expect.objectContaining({ generationRun: ctx.run }),
    );

    // generateRoadblocks never touches ctx.run.startup — attribution stays
    // whatever the controller set from dto.startupId.
    expect(ctx.run.startup).toBe(startup);
  });
});

describe('RoadblockService.refineRoadblock provenance', () => {
  const startup = () => ({
    id: 1,
    name: 'AgroLink',
    capsuleProposal: { title: 't' },
  });

  function buildRefineEm(roadblock: any) {
    return {
      findOne: jest.fn((entity: any) => {
        if (entity === Roadblock) return Promise.resolve(roadblock);
        return Promise.resolve(null);
      }),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
    };
  }

  // The controller opens roadblocks_refine runs with startupId: null (the only
  // route param is the roadblock id), so ctx.run.startup starts unset.
  const refineCtx = () =>
    ({
      runId: 88,
      run: { id: 88, startup: undefined } as any,
      tokens: { promptTokens: 0, completionTokens: 0, recorded: false },
      config: Object.freeze({
        model: 'gemini-2.5-flash-lite',
        temperature: 0,
        grounding: true,
        rag: true,
        biasReview: true,
        scoreNormalization: true,
      }),
    }) as any;

  it('threads ctx into the AI calls and attributes the run to the roadblock startup', async () => {
    const s = startup();
    const em = buildRefineEm({
      id: 30,
      description: 'Old description',
      fix: 'Old fix',
      riskNumber: 3,
      startup: s,
    });

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      refineRoadblock: jest.fn().mockResolvedValue({
        refinedDescription: 'New, sharper description',
        aiCommentary: 'Tightened the language.',
      }),
    };

    const ctx = refineCtx();
    const { aiRunService, forkedEm } = buildAiRunService();
    const service = new RoadblockService(em as any, aiService as any, aiRunService);

    const result = await service.refineRoadblock(30, [], 'Make it sharper', ctx);

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, s, em);
    expect(aiService.refineRoadblock).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(ctx.run.startup).toBe(s);
    // Attribution must reach the database, not just ctx.run — `finish`'s
    // payload omits `startup`, so otherwise the row waits on a later flush.
    expect(forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 88 },
      { startup: 1 },
    );
    expect(result.refinedDescription).toBe('New, sharper description');
  });

  // On the failure path nothing flushes the request EM, so a bare assignment
  // is discarded and the row lands status='failed' with startup_id NULL —
  // invisible to the startup-filtered provenance query.
  it('attributes the run in the database even when the AI call then throws', async () => {
    const s = startup();
    const em = buildRefineEm({
      id: 30,
      description: 'Old description',
      fix: 'Old fix',
      riskNumber: 3,
      startup: s,
    });

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      refineRoadblock: jest
        .fn()
        .mockRejectedValue(new Error('AI returned an invalid JSON response')),
    };

    const ctx = refineCtx();
    const { aiRunService, forkedEm } = buildAiRunService();
    const service = new RoadblockService(em as any, aiService as any, aiRunService);

    await expect(
      service.refineRoadblock(30, [], 'Make it sharper', ctx),
    ).rejects.toThrow('AI returned an invalid JSON response');

    expect(forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 88 },
      { startup: 1 },
    );
  });

  it('throws NotFoundException without ever setting ctx.run.startup when the roadblock does not exist', async () => {
    const em = {
      findOne: jest.fn().mockResolvedValue(null),
      persistAndFlush: jest.fn(),
    };

    const aiService = {
      createBasePrompt: jest.fn(),
      refineRoadblock: jest.fn(),
    };

    const ctx = buildCtx();
    const { aiRunService, forkedEm } = buildAiRunService();
    const service = new RoadblockService(em as any, aiService as any, aiRunService);

    await expect(
      service.refineRoadblock(999, [], 'Make it sharper', ctx),
    ).rejects.toThrow('Roadblock not found');

    expect(ctx.run.startup).toBeUndefined();
    expect(forkedEm.nativeUpdate).not.toHaveBeenCalled();
    expect(aiService.createBasePrompt).not.toHaveBeenCalled();
  });
});
