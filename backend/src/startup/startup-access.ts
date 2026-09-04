import { Startup } from '../entities/startup.entity';
import { Role } from '../entities/enums/role.enum';

type Requester = { id?: number; role?: Role | string } | undefined;

/**
 * Who may see or change a startup's record.
 *
 * These endpoints carried only `JwtGuard`, so any authenticated account — another
 * startup's founder included — could read or rewrite any startup, capsule
 * proposal included. That matters beyond access control on the write path: the
 * capsule proposal is the source document the grounding and RNA measurement runs
 * read, and `measurement/` keeps no document versions.
 *
 * Managers are the administrative role and reach any startup; a Mentor reaches
 * one they are assigned to; founders and members reach their own. Read and write
 * share one rule deliberately — there is no startup a user may read but not act
 * on.
 */
export function canAccessStartup(
  startup: Startup,
  user: Requester,
): boolean {
  if (!user?.id) {
    return false;
  }

  if (user.role === Role.Manager) {
    return true;
  }

  // May be an id-only reference when the relation was not populated.
  if (startup.user?.id === user.id) {
    return true;
  }

  const inCollection = (collection: { getIdentifiers?: () => unknown[] }) => {
    try {
      return (collection?.getIdentifiers?.() ?? []).some(
        (id) => Number(id) === user.id,
      );
    } catch {
      // Not initialised — treat as no match rather than throwing mid-request.
      return false;
    }
  };

  return inCollection(startup.members) || inCollection(startup.mentors);
}
