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
