import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '../../entities/enums/role.enum';

// Named for the /admin surface it protects, not for a role: SDD 1.4 puts every
// administrative function behind Manager. There is no Admin role.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as { role?: Role | string } | undefined;
    if (!user || user.role !== Role.Manager) {
      throw new ForbiddenException('Managers only');
    }
    return true;
  }
}
