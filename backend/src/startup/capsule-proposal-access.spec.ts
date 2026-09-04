import { canEditCapsuleProposal } from './capsule-proposal-access';
import { Role } from '../entities/enums/role.enum';

// startup 1: owned by user 10, member 11, mentored by 20.
const startup = {
  user: { id: 10 },
  members: { getIdentifiers: () => [11] },
  mentors: { getIdentifiers: () => [20] },
} as any;

const as = (id: number, role: Role) => ({ id, role });

describe('canEditCapsuleProposal', () => {
  it('admits the owning founder', () => {
    expect(canEditCapsuleProposal(startup, as(10, Role.Startup))).toBe(true);
  });

  it('admits a member of the startup', () => {
    expect(canEditCapsuleProposal(startup, as(11, Role.Startup))).toBe(true);
  });

  it('admits the assigned mentor', () => {
    expect(canEditCapsuleProposal(startup, as(20, Role.Mentor))).toBe(true);
  });

  // Managers are the administrative role: full write access, every startup.
  it('admits any Manager', () => {
    expect(canEditCapsuleProposal(startup, as(99, Role.Manager))).toBe(true);
  });

  // The case the endpoint was open to: another startup's founder.
  it('rejects a founder from a different startup', () => {
    expect(canEditCapsuleProposal(startup, as(12, Role.Startup))).toBe(false);
  });

  it('rejects a mentor not assigned to this startup', () => {
    expect(canEditCapsuleProposal(startup, as(21, Role.Mentor))).toBe(false);
  });

  it('rejects a missing user', () => {
    expect(canEditCapsuleProposal(startup, undefined)).toBe(false);
  });

  // An owner reference can come back id-only, so `user` may be a bare ref.
  it('reads the owner id off an unpopulated reference', () => {
    const idOnly = { ...startup, user: { id: 10, __helper: {} } } as any;
    expect(canEditCapsuleProposal(idOnly, as(10, Role.Startup))).toBe(true);
  });
});
