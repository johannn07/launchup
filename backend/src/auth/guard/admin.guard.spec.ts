import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { Role } from '../../entities/enums/role.enum';

function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('admits a Manager', () => {
    expect(guard.canActivate(contextFor({ role: Role.Manager }))).toBe(true);
  });

  it.each([Role.Startup, Role.Mentor])('rejects %s', (role) => {
    expect(() => guard.canActivate(contextFor({ role }))).toThrow(
      ForbiddenException,
    );
  });

  // The guard reads req.user rather than authenticating, so an unpaired
  // JwtGuard would leave it undefined — that must fail closed.
  it('rejects an unauthenticated request', () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });

  // 'Admin' is gone from the enum; a token minted before the migration still
  // carries it, and must not be honoured.
  it('rejects a stale Admin role string', () => {
    expect(() => guard.canActivate(contextFor({ role: 'Admin' }))).toThrow(
      ForbiddenException,
    );
  });
});
