import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from './admin.guard';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

const ADMIN_EMAIL = 'boss@cinnetemple.com';

function makeGuard(findFirst: jest.Mock) {
  const config = { get: () => [ADMIN_EMAIL] } as unknown as ConfigService;
  const prisma = { credential: { findFirst } } as never;
  return new AdminGuard(config, prisma);
}

function contextFor(user: AuthenticatedUser | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function user(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return { sub: 'user-1', email: ADMIN_EMAIL, roles: [], ...overrides };
}

describe('AdminGuard (CT-02 — bootstrap requires provable ownership)', () => {
  it('DENIES an ADMIN_EMAILS address that only has an EMAIL (self-serve) credential', async () => {
    const findFirst = jest.fn(async () => null); // no GOOGLE/APPLE credential
    const guard = makeGuard(findFirst);

    await expect(guard.canActivate(contextFor(user({ roles: [] })))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // The lookup filtered on the federated providers only.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          provider: { in: ['GOOGLE', 'APPLE'] },
        }),
      }),
    );
  });

  it('ALLOWS an ADMIN_EMAILS address that has a GOOGLE credential', async () => {
    const findFirst = jest.fn(async () => ({ id: 'cred-1' }));
    const guard = makeGuard(findFirst);

    await expect(guard.canActivate(contextFor(user({ roles: [] })))).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('ALLOWS a DB `admin` role regardless of email or credentials (no DB lookup)', async () => {
    const findFirst = jest.fn(async () => null);
    const guard = makeGuard(findFirst);

    await expect(
      guard.canActivate(contextFor(user({ email: 'nobody@example.com', roles: ['admin'] }))),
    ).resolves.toBe(true);
    // The trusted role path short-circuits before any credential lookup.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('DENIES a non-admin email with no admin role', async () => {
    const findFirst = jest.fn(async () => null);
    const guard = makeGuard(findFirst);

    await expect(
      guard.canActivate(contextFor(user({ email: 'random@example.com', roles: [] }))),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('DENIES when no authenticated principal is present', async () => {
    const guard = makeGuard(jest.fn());
    await expect(guard.canActivate(contextFor(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
