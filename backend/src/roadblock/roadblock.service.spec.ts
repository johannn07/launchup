import { RoadblockService } from './roadblock.service';
import { AiRunService } from 'src/ai/ai-run.service';
import { Startup } from 'src/entities/startup.entity';
import { Rns } from 'src/entities/rns.entity';
import { Initiative } from 'src/entities/initiative.entity';
import { Roadblock } from 'src/entities/roadblock.entity';

// A *real* AiRunService over a stub EntityManager, so these tests exercise
// the actual durable-attribution write rather than a mock that only mutates
// ctx.run in memory. An earlier round of this fix passed its tests while the
// database row stayed startup_id NULL precisely because the assertions
// stopped at ctx.run.
function buildAiRunService() {
  const forkedEm = { nativeUpdate: jest.fn().mockResolvedValue(1) };
  const service = new AiRunService(
    { fork: () => forkedEm } as any,
    {} as any, // AiConfigService, unused by attribute()
  );
  return { aiRunService: service, forkedEm };
}

// RoadblockService's real constructor arity (EntityManager, AiService)
// matches what the brief assumed, so no correction was needed there.
// Unlike GenerateInitiativeDto, GenerateRoadblocksDto DOES carry a real
// startupId field, so RoadblockController passes it straight to
// AiRunService.track() when opening the run — generateRoadblocks never
// needs to backfill ctx.run.startup itself. refineRoadblock, whose only
// route param is the roadblock id, still needs the backfill, mirroring
// InitiativeService.refineInitiative.
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

  // em mock branches on entity class rather than relying on call order, so
  // reordering an unrelated query in the service does not break this test.
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

    // dto.startupId is a real field, so the controller already attributed
    // ctx.run.startup at AiRunService.begin() time; simulate that here.
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

    // generationRun? is optional on Roadblock, so an unasserted stamping
    // would compile clean and pass silently if the line were reverted.
    expect(created.some((row) => row.generationRun === ctx.run)).toBe(true);

    // generationRun? is likewise optional on the recordAiRecommendation and
    // recordBiasAudit input types.
    expect(aiService.recordAiRecommendation).toHaveBeenCalledWith(
      expect.objectContaining({ generationRun: ctx.run }),
    );
    expect(aiService.recordBiasAudit).toHaveBeenCalledWith(
      expect.objectContaining({ generationRun: ctx.run }),
    );

    // generateRoadblocks does not touch ctx.run.startup itself — attribution
    // stays exactly what the controller set from dto.startupId.
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

  // The controller opens roadblocks_refine runs with startupId: null, since
  // the only route param is the roadblock id. ctx.run.startup starts unset
  // here to mirror that; the assertions below prove the service fixes it up
  // once the startup is loaded.
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
    // The point of the fix: attribution reaches the database, not just
    // ctx.run. `finish`'s payload never carries `startup`, so without this
    // write the row would depend entirely on some later flush.
    expect(forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 88 },
      { startup: 1 },
    );
    expect(result.refinedDescription).toBe('New, sharper description');
  });

  // The regression this whole fix exists for: on the failure path nothing
  // flushes the request-context EM, so a bare `ctx.run.startup = startup`
  // assignment is discarded and the row lands status='failed' with
  // startup_id NULL — invisible to the startup-filtered provenance query.
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
