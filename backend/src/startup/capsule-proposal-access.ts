import { Startup } from '../entities/startup.entity';
import { Role } from '../entities/enums/role.enum';

type Requester = { id?: number; role?: Role | string } | undefined;

/**
 * Who may write a startup's capsule proposal.
 *
 * The endpoint carried only `JwtGuard`, so any authenticated account — another
 * startup's founder included — could rewrite any proposal. That matters beyond
 * access control: the capsule proposal is the source document the grounding and
 * RNA measurement runs read, and `measurement/` keeps no document versions.
 *
 * Managers are the administrative role and may edit any startup's; a Mentor may
 * edit one they are assigned to; founders may edit their own.
 */
export function canEditCapsuleProposal(
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
