import { RoadblockService } from './roadblock.service';
import { Startup } from 'src/entities/startup.entity';
import { Rns } from 'src/entities/rns.entity';
import { Initiative } from 'src/entities/initiative.entity';
import { Roadblock } from 'src/entities/roadblock.entity';

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
    const service = new RoadblockService(em as any, aiService as any);

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
  it('threads ctx into the AI calls and attributes the run to the roadblock startup', async () => {
    const startup = {
      id: 1,
      name: 'AgroLink',
      capsuleProposal: { title: 't' },
    };

    const roadblock = {
      id: 30,
      description: 'Old description',
      fix: 'Old fix',
      riskNumber: 3,
      startup,
    };

    const em = {
      findOne: jest.fn((entity: any) => {
        if (entity === Roadblock) return Promise.resolve(roadblock);
        return Promise.resolve(null);
      }),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
    };

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      refineRoadblock: jest.fn().mockResolvedValue({
        refinedDescription: 'New, sharper description',
        aiCommentary: 'Tightened the language.',
      }),
    };

    // The controller opens roadblocks_refine runs with startupId: null,
    // since the only route param is the roadblock id. ctx.run.startup
    // starts unset here to mirror that; the assertion below proves the
    // service fixes it up once the startup is loaded.
    const ctx = {
      runId: 88,
      run: { id: 88, startup: undefined } as any,
      config: Object.freeze({
        model: 'gemini-2.5-flash-lite',
        temperature: 0,
        grounding: true,
        rag: true,
        biasReview: true,
        scoreNormalization: true,
      }),
    } as any;

    const service = new RoadblockService(em as any, aiService as any);

    const result = await service.refineRoadblock(30, [], 'Make it sharper', ctx);

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, startup, em);
    expect(aiService.refineRoadblock).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(ctx.run.startup).toBe(startup);
    expect(result.refinedDescription).toBe('New, sharper description');
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
    const service = new RoadblockService(em as any, aiService as any);

    await expect(
      service.refineRoadblock(999, [], 'Make it sharper', ctx),
    ).rejects.toThrow('Roadblock not found');

    expect(ctx.run.startup).toBeUndefined();
    expect(aiService.createBasePrompt).not.toHaveBeenCalled();
  });
});
