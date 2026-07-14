import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthProvider } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Identity providers that cryptographically prove the account's email is really
 * owned by the principal (the email is verified against the IdP during sign-in).
 * The self-serve EMAIL path does NOT count: with EMAIL_VERIFICATION_REQUIRED
 * false (the Railway default) local accounts are auto-verified at registration
 * without any proof of ownership, so a listed ADMIN_EMAILS address could be
 * claimed by anyone who registers it first (see SECURITY_AUDIT CT-02).
 */
const PROVEN_IDENTITY_PROVIDERS: AuthProvider[] = [AuthProvider.GOOGLE, AuthProvider.APPLE];

/**
 * Grants access to admins. A principal is an admin if it holds the `admin` role
 * (seeded in the DB and carried in the application-signed JWT) OR its email is
 * listed in ADMIN_EMAILS (bootstrap, so the first operator can manage the
 * platform before roles are seeded). Runs after the global JwtAuthGuard, so
 * `req.user` is always populated here.
 *
 * The ADMIN_EMAILS bootstrap path additionally requires the account to be
 * provably owned — i.e. the email was verified through a real identity provider
 * (Google/Apple), never merely the auto-verified email/password path. This
 * closes the CT-02 self-elevation hole where an attacker registers a listed
 * bootstrap email via email/password and self-elevates. The explicit DB `admin`
 * role stays fully trusted (it is only ever set by an existing admin).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly adminEmails: string[];

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.adminEmails = config.get<string[]>('adminEmails') ?? [];
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
    if (!user) throw new ForbiddenException('Authentication required');

    // Fully trusted: the DB-seeded `admin` role, signed into the JWT by us.
    if ((user.roles ?? []).includes('admin')) return true;

    // Bootstrap path: an ADMIN_EMAILS match is only honoured when the account is
    // provably owned via a federated identity provider. One indexed lookup on
    // credentials(user_id) — only for the (rare) email-match case.
    if (this.adminEmails.includes((user.email ?? '').toLowerCase())) {
      const cred = await this.prisma.credential.findFirst({
        where: { userId: user.sub, provider: { in: PROVEN_IDENTITY_PROVIDERS } },
        select: { id: true },
      });
      if (cred) return true;
    }

    throw new ForbiddenException('Admin access required');
  }
}

/**
 * Pure check reused outside guard context (e.g. resolving `me.isAdmin`, a
 * display flag only — never a privilege boundary). Enforcement lives in
 * {@link AdminGuard}, which additionally proves ownership for the ADMIN_EMAILS
 * bootstrap path.
 */
export function isAdminUser(
  user: { roles?: string[]; email?: string },
  adminEmails: string[],
): boolean {
  return (
    (user.roles ?? []).includes('admin') || adminEmails.includes((user.email ?? '').toLowerCase())
  );
}
