import { canAccessStartup } from './startup-access';
import { Role } from '../entities/enums/role.enum';

// startup 1: owned by user 10, member 11, mentored by 20.
const startup = {
  user: { id: 10 },
  members: { getIdentifiers: () => [11] },
  mentors: { getIdentifiers: () => [20] },
} as any;

const as = (id: number, role: Role) => ({ id, role });

describe('canAccessStartup', () => {
  it('admits the owning founder', () => {
    expect(canAccessStartup(startup, as(10, Role.Startup))).toBe(true);
  });

  it('admits a member of the startup', () => {
    expect(canAccessStartup(startup, as(11, Role.Startup))).toBe(true);
  });

  it('admits the assigned mentor', () => {
    expect(canAccessStartup(startup, as(20, Role.Mentor))).toBe(true);
  });

  // Managers are the administrative role: every startup, read and write.
  it('admits any Manager', () => {
    expect(canAccessStartup(startup, as(99, Role.Manager))).toBe(true);
  });

  // The case these endpoints were open to: another startup's founder.
  it('rejects a founder from a different startup', () => {
    expect(canAccessStartup(startup, as(12, Role.Startup))).toBe(false);
  });

  it('rejects a mentor not assigned to this startup', () => {
    expect(canAccessStartup(startup, as(21, Role.Mentor))).toBe(false);
  });

  it('rejects a missing user', () => {
    expect(canAccessStartup(startup, undefined)).toBe(false);
  });

  // An owner reference can come back id-only, so `user` may be a bare ref.
  it('reads the owner id off an unpopulated reference', () => {
    const idOnly = { ...startup, user: { id: 10, __helper: {} } } as any;
    expect(canAccessStartup(idOnly, as(10, Role.Startup))).toBe(true);
  });
});
