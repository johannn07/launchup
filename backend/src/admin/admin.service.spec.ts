import { BadRequestException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { AdminService } from './admin.service';
import { Role } from '../entities/enums/role.enum';

// Every Manager can reach deleteUser now that AdminGuard gates on Manager, so
// the destructive cases below are reachable by any staff account.
function serviceWith(users: any[]) {
  const remove = jest.fn(async () => undefined);
  const em = {
    count: jest.fn(
      async (_entity: unknown, where: any) =>
        users.filter((u) => u.role === where.role).length,
    ),
    create: jest.fn((_entity: unknown, data: any) => data),
    persistAndFlush: jest.fn(async () => undefined),
  } as unknown as EntityManager;

  const userService = {
    findOneById: jest.fn(
      async (id: number) => users.find((u) => u.id === id) ?? null,
    ),
    remove,
  };

  const service = new AdminService(
    userService as any,
    {} as any,
    {} as any,
    em,
  );
  return { service, remove };
}

const MANAGER_A = { id: 1, email: 'a@launchup.local', role: Role.Manager };
const MANAGER_B = { id: 2, email: 'b@launchup.local', role: Role.Manager };
const FOUNDER = { id: 3, email: 'f@launchup.local', role: Role.Startup };

describe('AdminService.deleteUser', () => {
  it('deletes another user', async () => {
    const { service, remove } = serviceWith([MANAGER_A, MANAGER_B, FOUNDER]);
    await service.deleteUser(FOUNDER.id, MANAGER_A.id);
    expect(remove).toHaveBeenCalledWith(FOUNDER.id);
  });

  it('refuses to delete the requester', async () => {
    const { service, remove } = serviceWith([MANAGER_A, MANAGER_B]);
    await expect(
      service.deleteUser(MANAGER_A.id, MANAGER_A.id),
    ).rejects.toThrow(BadRequestException);
    expect(remove).not.toHaveBeenCalled();
  });

  // Managers are the only role that can create users, so deleting the last one
  // locks every remaining account out of user administration permanently.
  it('refuses to delete the last Manager', async () => {
    const { service, remove } = serviceWith([MANAGER_A, FOUNDER]);
    await expect(service.deleteUser(MANAGER_A.id, FOUNDER.id)).rejects.toThrow(
      BadRequestException,
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes a Manager while another remains', async () => {
    const { service, remove } = serviceWith([MANAGER_A, MANAGER_B]);
    await service.deleteUser(MANAGER_B.id, MANAGER_A.id);
    expect(remove).toHaveBeenCalledWith(MANAGER_B.id);
  });
});

// The page swaps the response into its list, so an unpopulated startup would
// serialize as a bare id and render as "Startup #Unknown".
describe('AdminService.overrideBiasAudit', () => {
  function overrideService() {
    const audit: any = {
      id: 24,
      dimensionKey: 'Market',
      correctedScore: 5,
      biasFlagged: true,
      biasStatus: 'flagged',
      justification: 'Reviewer: claims lack evidence.',
      startup: { id: 1 },
    };
    const findOne = jest.fn(async () => audit);
    const flush = jest.fn(async () => undefined);
    const create = jest.fn((_entity: unknown, data: any) => data);
    const em = {
      findOne,
      flush,
      create,
      persistAndFlush: jest.fn(async () => undefined),
    } as unknown as EntityManager;
    const service = new AdminService({} as any, {} as any, {} as any, em);
    return { service, audit, findOne, flush, create };
  }

  it('returns the audit with its startup populated', async () => {
    const { service, findOne } = overrideService();

    const result = await service.overrideBiasAudit(24, {
      correctedScore: 3,
      justification: 'Pilot contract verified by phone.',
    });

    expect(findOne).toHaveBeenCalledWith(
      expect.anything(),
      { id: 24 },
      expect.objectContaining({ populate: ['startup'] }),
    );
    expect(result.correctedScore).toBe(3);
  });

  // SRS 2.1: the Manager overrides a score and enters a justification.
  it.each([undefined, '', '   '])(
    'rejects an override with justification %p',
    async (justification) => {
      const { service, audit, flush } = overrideService();

      await expect(
        service.overrideBiasAudit(24, { correctedScore: 3, justification }),
      ).rejects.toThrow(BadRequestException);
      expect(flush).not.toHaveBeenCalled();
      expect(audit.correctedScore).toBe(5);
    },
  );

  // Otherwise the audit still reads Flagged after a person has resolved it.
  it('marks the audit overridden and keeps the reviewer justification', async () => {
    const { service, audit } = overrideService();

    await service.overrideBiasAudit(24, {
      correctedScore: 3,
      justification: '  Pilot contract verified by phone.  ',
    });

    expect(audit.biasStatus).toBe('overridden');
    expect(audit.biasFlagged).toBe(false);
    expect(audit.overrideJustification).toBe('Pilot contract verified by phone.');
    expect(audit.justification).toBe('Reviewer: claims lack evidence.');
  });

  it('logs the score change, the reason and who made it', async () => {
    const { service, create } = overrideService();

    await service.overrideBiasAudit(
      24,
      { correctedScore: 3, justification: 'Pilot contract verified by phone.' },
      'manager@launchup.local',
    );

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        details:
          'Overrode bias audit 24 (Market): 5 to 3. Reason: Pilot contract verified by phone.',
        actor: 'manager@launchup.local',
      }),
    );
  });
});

// A score below every threshold must relabel to the lowest tier, as
// ReadinessService scores it, not to 'Pending', the qualification status.
describe('AdminService.upsertTierConfigs', () => {
  it('relabels scores below every threshold to the lowest tier', async () => {
    const execute = jest.fn(async () => undefined);
    const em = {
      find: jest.fn(async () => []),
      remove: jest.fn(),
      flush: jest.fn(async () => undefined),
      persist: jest.fn(),
      create: jest.fn((_entity: unknown, data: any) => data),
      persistAndFlush: jest.fn(async () => undefined),
      getConnection: () => ({ execute }),
    } as unknown as EntityManager;
    const service = new AdminService({} as any, {} as any, {} as any, em);

    await service.upsertTierConfigs([
      { tierLabel: 'Ready', threshold: 70 },
      { tierLabel: "O'Early", threshold: 25 },
    ]);

    const sql = (execute.mock.calls[0] as unknown as [string])[0];
    expect(sql).toContain(`ELSE 'O''Early' END`);
    expect(sql).not.toContain('Pending');
  });
});
