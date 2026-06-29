import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Grants access to admins. A principal is an admin if it holds the `admin` role
 * (from the JWT) OR its email is listed in ADMIN_EMAILS (bootstrap, so the first
 * operator can manage the platform before roles are seeded). Runs after the
 * global JwtAuthGuard, so `req.user` is always populated here.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly adminEmails: string[];

  constructor(config: ConfigService) {
    this.adminEmails = config.get<string[]>('adminEmails') ?? [];
  }

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException('Authentication required');
    const isAdmin =
      (user.roles ?? []).includes('admin') ||
      this.adminEmails.includes((user.email ?? '').toLowerCase());
    if (!isAdmin) throw new ForbiddenException('Admin access required');
    return true;
  }
}

/** Pure check reused outside guard context (e.g. resolving `me.isAdmin`). */
export function isAdminUser(user: { roles?: string[]; email?: string }, adminEmails: string[]): boolean {
  return (
    (user.roles ?? []).includes('admin') ||
    adminEmails.includes((user.email ?? '').toLowerCase())
  );
}
