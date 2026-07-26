import { InitiativeService } from './initiative.service';
import { Initiative } from 'src/entities/initiative.entity';
import { Rns } from 'src/entities/rns.entity';

// InitiativeService's real constructor arity (EntityManager, AiService)
// matches what the brief assumed, so no correction was needed there.
// GenerateInitiativeDto, however, carries no startup id at all (only
// rnsId/rnsIds/no_of_initiatives_to_create/debug) — the brief's claim that
// the generate-initiatives endpoint "takes dto.startup_id" does not match
// the DTO or the frontend caller. generateInitiatives instead resolves the
// startup from the Rns entity it loads, so these tests assert ctx.run.startup
// is set from that loaded Rns rather than from a DTO field.
describe('InitiativeService.generateInitiatives provenance', () => {
  const buildRns = (overrides: Partial<Rns> = {}) =>
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

  function buildEm(rns: any, created: any[]) {
    return {
      find: jest.fn((entity: any) => {
        if (entity === Initiative) return Promise.resolve([]); // no existing initiatives
        return Promise.resolve([]);
      }),
      count: jest.fn().mockResolvedValue(0),
      findOneOrFail: jest.fn((entity: any) => {
        if (entity === Rns) return Promise.resolve(rns);
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
    const em = buildEm(rns, created);

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      generateInitiativesFromPrompt: jest
        .fn()
        .mockResolvedValue([
          { description: 'Run 10 pilots', measures: 'Pilots run', targets: '10 pilots', remarks: 'n/a' },
        ]),
    };

    const ctx = buildCtx();
    const service = new InitiativeService(em as any, aiService as any);

    const result = await service.generateInitiatives(
      { rnsIds: [10], no_of_initiatives_to_create: 1 } as any,
      ctx,
    );

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, rns.startup, em);
    expect(aiService.generateInitiativesFromPrompt).toHaveBeenCalledWith(ctx, expect.any(String));

    // generationRun? is optional on Initiative, so an unasserted stamping
    // would compile clean and pass silently if the line were reverted.
    expect(created.some((row) => row.generationRun === ctx.run)).toBe(true);
    expect(result.some((row: any) => row.generationRun === ctx.run)).toBe(true);

    // generate-initiatives has no startup id in its DTO, so the run must be
    // attributed here, from the Rns entity the service already loaded.
    expect(ctx.run.startup).toBe(rns.startup);
  });

  it('threads ctx into the AI calls and stamps generated rows for the single-rnsId branch', async () => {
    const rns = buildRns({ id: 20 });
    const created: any[] = [];
    const em = buildEm(rns, created);

    const aiService = {
      createBasePrompt: jest.fn().mockResolvedValue('base prompt'),
      generateInitiativesFromPrompt: jest
        .fn()
        .mockResolvedValue([
          { description: 'Run 5 interviews', measures: 'Interviews run', targets: '5 interviews', remarks: 'n/a' },
        ]),
    };

    const ctx = buildCtx();
    const service = new InitiativeService(em as any, aiService as any);

    const result = await service.generateInitiatives(
      { rnsId: 20, no_of_initiatives_to_create: 1 } as any,
      ctx,
    );

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, rns.startup, em);
    expect(aiService.generateInitiativesFromPrompt).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(created.some((row) => row.generationRun === ctx.run)).toBe(true);
    expect(result.some((row: any) => row.generationRun === ctx.run)).toBe(true);
    expect(ctx.run.startup).toBe(rns.startup);
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

    // The controller opens initiatives_refine runs with startupId: null,
    // since the only route param is the initiative id. ctx.run.startup
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

    const service = new InitiativeService(em as any, aiService as any);

    const result = await service.refineInitiative(30, [], 'Make it sharper', ctx);

    expect(aiService.createBasePrompt).toHaveBeenCalledWith(ctx, startup, em);
    expect(aiService.refineInitiative).toHaveBeenCalledWith(ctx, expect.any(String));
    expect(ctx.run.startup).toBe(startup);
    expect(result.refinedDescription).toBe('New, sharper description');
  });
});
