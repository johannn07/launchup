import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from 'src/entities/enums/role.enum';
import { ProgressService } from './progress.service';

// SRS 3.3: the report was JwtGuard-only, so any signed-in user could read any
// startup's levels, RNA, next steps and roadblocks by changing the id.
describe('ProgressService.getProgressReport access', () => {
  const ids = (...n: number[]) => ({ getIdentifiers: () => n });
  const startup = { id: 7, user: { id: 1 }, members: ids(2), mentors: ids(3) };
  const em = (found: unknown) =>
    ({
      findOne: jest.fn().mockResolvedValue(found),
      find: jest.fn().mockResolvedValue([]),
    }) as any;

  it('refuses a founder of another startup', async () => {
    const service = new ProgressService(em(startup));
    await expect(
      service.getProgressReport(7, { id: 99, role: Role.Startup }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a mentor not assigned to the startup', async () => {
    const service = new ProgressService(em(startup));
    await expect(
      service.getProgressReport(7, { id: 98, role: Role.Mentor }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    ['the founder', { id: 1, role: Role.Startup }],
    ['a member', { id: 2, role: Role.Startup }],
    ['the assigned mentor', { id: 3, role: Role.Mentor }],
    ['a manager', { id: 50, role: Role.Manager }],
  ])('allows %s', async (_label, user) => {
    const service = new ProgressService(em(startup));
    await expect(service.getProgressReport(7, user)).resolves.toBeDefined();
  });

  it('still reports a missing startup as not found', async () => {
    const service = new ProgressService(em(null));
    await expect(
      service.getProgressReport(7, { id: 50, role: Role.Manager }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('loads members and mentors so the rule can see them', async () => {
    const manager = em(startup);
    await new ProgressService(manager).getProgressReport(7, {
      id: 1,
      role: Role.Startup,
    });
    expect(manager.findOne.mock.calls[0][2]).toEqual({
      populate: ['members', 'mentors'],
    });
  });
});
