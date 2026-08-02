import { InitiativeService } from './initiative.service';
import { AiRunService } from 'src/ai/ai-run.service';
import { Initiative } from 'src/entities/initiative.entity';
import { Rns } from 'src/entities/rns.entity';

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

// GenerateInitiativeDto carries no startup id (only rnsId/rnsIds/
// no_of_initiatives_to_create/debug), so generateInitiatives resolves the
// startup from the Rns it loads — hence the assertions below check
// ctx.run.startup against that Rns, not a DTO field.
describe('InitiativeService.generateInitiatives provenance', () => {
  const buildRns = (overrides: Record<string, any> = {}) =>
    ({
      id: 10,
      priorityNumber: 1,
      readinessType: 'Technology',
      status: 1,
      targetLevel: { level: 3 },
      description: 'Existing RNS description',
      startup: {
        id: 1,
        name: 'AgroLink',
        user: { id: 5 },
        capsuleProposal: { title: 't' },
      },
      ...overrides,
    }) as any;

  // Maps an Rns id to the entity to resolve with, or an Error to reject with,
  // so a test can plant a bad id partway through a batch. Keyed on `where.id`,
  // not call order.
  function buildEm(rnsById: Record<number, any>, created: any[]) {
    return {
      find: jest.fn((entity: any) => {
        if (entity === Initiative) return Promise.resolve([]); // no existing initiatives
        return Promise.resolve([]);
      }),
      count: jest.fn().mockResolvedValue(0),
      findOneOrFail: jest.fn((entity: any, where: any) => {
        if (entity === Rns) {
          const result = rnsById[where.id];
          if (result instanceof Error) return Promise.reject(result);
          if (result) return Promise.resolve(result);
          return Promise.reject(new Error(`Rns ${where.id} not found`));
        }
        return Promise.reject(new Error(`Unexpected findOneOrFail(${entity})`));
      }),
      persistAndFlush: jest.fn((entity) => {
        created.push(entity);
        return Promise.resolve(undefined);
      }),
    };
  }

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

  it('threads ctx into the AI calls and stamps generated rows for the rnsIds branch', async () => {
    const rns = buildRns();
    const created: any[] = [];
    const em = buildEm({ [rns.id]: rns }, created);

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      generateInitiativesFromPrompt: jest
        .fn()
        .mockResolvedValue([
          { description: 'Run 10 pilots', measures: 'Pilots run', targets: '10 pilots', remarks: 'n/a' },
        ]),
    };

    const ctx = buildCtx();
    const { aiRunService, forkedEm } = buildAiRunService();
    const service = new InitiativeService(em as any, aiService as any, aiRunService);

    const result = await service.generateInitiatives(
      { rnsIds: [10], no_of_initiatives_to_create: 1 } as any,
      ctx,
    );

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, rns.startup, em);
    expect(aiService.generateInitiativesFromPrompt).toHaveBeenCalledWith(ctx, expect.any(String));

    // generationRun? is optional on Initiative, so reverting the stamping
    // would compile clean and pass without this assertion.
    expect(created.some((row) => row.generationRun === ctx.run)).toBe(true);
    expect(result.some((row: any) => row.generationRun === ctx.run)).toBe(true);

    // No startup id in the DTO, so the run is attributed from the loaded Rns —
    // and must reach the database, since `finish`'s payload omits `startup`.
    expect(ctx.run.startup).toBe(rns.startup);
    expect(forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 77 },
      { startup: rns.startup.id },
    );
  });

  it('threads ctx into the AI calls and stamps generated rows for the single-rnsId branch', async () => {
    const rns = buildRns({ id: 20 });
    const created: any[] = [];
    const em = buildEm({ [rns.id]: rns }, created);

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      generateInitiativesFromPrompt: jest
        .fn()
        .mockResolvedValue([
          { description: 'Run 5 interviews', measures: 'Interviews run', targets: '5 interviews', remarks: 'n/a' },
        ]),
    };

    const ctx = buildCtx();
    const { aiRunService, forkedEm } = buildAiRunService();
    const service = new InitiativeService(em as any, aiService as any, aiRunService);

    const result = await service.generateInitiatives(
      { rnsId: 20, no_of_initiatives_to_create: 1 } as any,
      ctx,
    );

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, rns.startup, em);
    expect(aiService.generateInitiativesFromPrompt).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(created.some((row) => row.generationRun === ctx.run)).toBe(true);
    expect(result.some((row: any) => row.generationRun === ctx.run)).toBe(true);
    expect(ctx.run.startup).toBe(rns.startup);
    expect(forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 77 },
      { startup: rns.startup.id },
    );
  });

  it('leaves the run attributed to the first resolved startup when a later rnsId in the batch fails', async () => {
    const firstRns = buildRns({ id: 10 });
    const created: any[] = [];
    const em = buildEm(
      {
        10: firstRns,
        11: new Error('Rns with id 11 not found'),
      },
      created,
    );

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      generateInitiativesFromPrompt: jest.fn().mockResolvedValue([]),
    };

    const ctx = buildCtx();
    const { aiRunService, forkedEm } = buildAiRunService();
    const service = new InitiativeService(em as any, aiService as any, aiRunService);

    await expect(
      service.generateInitiatives(
        { rnsIds: [10, 11], no_of_initiatives_to_create: 1 } as any,
        ctx,
      ),
    ).rejects.toThrow('Rns with id 11 not found');

    // The lookup for id 11 must fail before the renumbering loop runs, or a
    // routine bad-id error leaves stray persistAndFlush side effects behind.
    expect(em.find).not.toHaveBeenCalled();

    // Still attributed to the startup that did resolve (id 10), despite the
    // call rejecting. Nothing flushes the request EM on this path, so only the
    // durable write is evidence.
    expect(ctx.run.startup).toBe(firstRns.startup);
    expect(forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 77 },
      { startup: firstRns.startup.id },
    );
  });

  it('attributes a multi-rnsId batch to the first startup, not the last, when the ids span different startups', async () => {
    const firstRns = buildRns({
      id: 10,
      startup: { id: 1, name: 'AgroLink', user: { id: 5 }, capsuleProposal: { title: 't' } },
    });
    const secondRns = buildRns({
      id: 11,
      startup: { id: 2, name: 'OtherCo', user: { id: 6 }, capsuleProposal: { title: 't2' } },
    });
    const created: any[] = [];
    const em = buildEm({ 10: firstRns, 11: secondRns }, created);

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      generateInitiativesFromPrompt: jest
        .fn()
        .mockResolvedValue([
          { description: 'd', measures: 'm', targets: 't', remarks: 'r' },
        ]),
    };

    const ctx = buildCtx();
    const { aiRunService, forkedEm } = buildAiRunService();
    const service = new InitiativeService(em as any, aiService as any, aiRunService);

    await service.generateInitiatives(
      { rnsIds: [10, 11], no_of_initiatives_to_create: 1 } as any,
      ctx,
    );

    // Both rows carry the single run, but the run's startup is the *first*
    // Rns's, not the last one processed.
    expect(ctx.run.startup).toBe(firstRns.startup);
    expect(ctx.run.startup).not.toBe(secondRns.startup);
    expect(forkedEm.nativeUpdate).toHaveBeenCalledTimes(1);
    expect(forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 77 },
      { startup: firstRns.startup.id },
    );
    expect(created.every((row) => row.generationRun === ctx.run)).toBe(true);
  });
});

describe('InitiativeService.refineInitiative provenance', () => {
  it('threads ctx into the AI calls and attributes the run to the initiative startup', async () => {
    const startup = {
      id: 1,
      name: 'AgroLink',
      capsuleProposal: { title: 't' },
    };

    const initiative = {
      id: 30,
      description: 'Old description',
      measures: 'Old measures',
      targets: 'Old targets',
      remarks: 'Old remarks',
      startup,
      rns: { description: 'Related RNS' },
    };

    const em = {
      findOne: jest.fn((entity: any) => {
        if (entity === Initiative) return Promise.resolve(initiative);
        return Promise.resolve(null);
      }),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
    };

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      refineInitiative: jest.fn().mockResolvedValue({
        refinedDescription: 'New, sharper description',
        aiCommentary: 'Tightened the language.',
      }),
    };

    // The controller opens initiatives_refine runs with startupId: null (the
    // only route param is the initiative id), so ctx.run.startup starts unset.
    const ctx = {
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
    } as any;

    const { aiRunService, forkedEm } = buildAiRunService();
    const service = new InitiativeService(em as any, aiService as any, aiRunService);

    const result = await service.refineInitiative(30, [], 'Make it sharper', ctx);

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, startup, em);
    expect(aiService.refineInitiative).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(ctx.run.startup).toBe(startup);
    expect(forkedEm.nativeUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { id: 88 },
      { startup: 1 },
    );
    expect(result.refinedDescription).toBe('New, sharper description');
  });
});
