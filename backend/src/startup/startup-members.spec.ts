import { StartupService } from './startup.service';
import { Startup } from 'src/entities/startup.entity';
import { User } from 'src/entities/user.entity';

/**
 * removeMemberFromStartup returned nothing while addMemberToStartup returned a
 * message, so the members page had no success signal to check and its own call
 * had drifted to a DELETE against a path the backend never exposed.
 */
function build(members: { id: number }[]) {
  const removed: unknown[] = [];
  const startup = {
    id: 1,
    members: {
      remove: (user: unknown) => {
        removed.push(user);
      },
      contains: (user: any) => members.some((m) => m.id === user.id),
      add: (user: unknown) => members.push(user as { id: number }),
    },
  };

  const em = {
    findOne: jest.fn((entity: unknown, where: { id: number }) => {
      if (entity === Startup) return Promise.resolve(startup);
      if (entity === User)
        return Promise.resolve(members.find((m) => m.id === where.id) ?? null);
      return Promise.resolve(null);
    }),
    flush: jest.fn().mockResolvedValue(undefined),
  };

  const service = new StartupService(
    em as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, em, removed };
}

describe('StartupService.removeMemberFromStartup', () => {
  it('removes the member and returns a confirmation, mirroring addMemberToStartup', async () => {
    const member = { id: 7 };
    const { service, em, removed } = build([member]);

    const result = await service.removeMemberFromStartup(7, 1);

    expect(removed).toEqual([member]);
    expect(em.flush).toHaveBeenCalled();
    expect(result).toEqual({
      message: 'User with ID 7 has been removed from Startup ID 1.',
    });
  });

  it('rejects an unknown user before touching the collection', async () => {
    const { service, removed } = build([{ id: 7 }]);

    await expect(service.removeMemberFromStartup(99, 1)).rejects.toThrow(
      'User with ID 99 not found.',
    );
    expect(removed).toEqual([]);
  });
});
