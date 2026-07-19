import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { DesktopAuthService } from './desktop-auth.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';

/** A valid PKCE pair: 43-char base64url verifier + its base64url SHA-256. */
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

type CodeRow = {
  id: string;
  codeHash: string;
  userId: string;
  challenge: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

const sha256Hex = (v: string) => createHash('sha256').update(v).digest('hex');

function makeService(overrides?: {
  record?: (codeHash: string) => CodeRow | null;
  user?: Record<string, unknown> | null;
  claimCount?: number;
}) {
  const created: CodeRow[] = [];
  const create = jest.fn(async ({ data }: { data: Omit<CodeRow, 'id' | 'consumedAt'> }) => {
    const row: CodeRow = { id: 'code-1', consumedAt: null, ...data };
    created.push(row);
    return row;
  });
  const findUnique = jest.fn(async ({ where }: { where: { codeHash: string } }) => {
    if (overrides?.record) return overrides.record(where.codeHash);
    return created.find((r) => r.codeHash === where.codeHash) ?? null;
  });
  const updateMany = jest.fn(async () => ({ count: overrides?.claimCount ?? 1 }));

  const prisma = { desktopAuthCode: { create, findUnique, updateMany } } as never;

  const user =
    overrides?.user === undefined
      ? {
          id: USER_ID,
          email: 'viewer@example.com',
          status: 'ACTIVE',
          roles: [{ role: { name: 'user' } }],
        }
      : overrides.user;
  const users = { findById: jest.fn(async () => user) } as never;

  const pair = { accessToken: 'a.b.c', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 };
  const issuePair = jest.fn(async () => pair);
  const tokens = { issuePair } as never;
  const audit = { record: jest.fn(async () => undefined) } as never;

  const service = new DesktopAuthService(users, tokens, audit, prisma);
  return { service, create, findUnique, updateMany, issuePair, audit, pair, created };
}

describe('DesktopAuthService — PKCE device link', () => {
  it('issues a single-use code storing only its SHA-256 + the challenge', async () => {
    const { service, created } = makeService();

    const result = await service.issueCode(USER_ID, CHALLENGE, {});

    expect(result.expiresInSeconds).toBe(300);
    expect(result.code).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
    const row = created[0]!;
    expect(row.codeHash).toBe(sha256Hex(result.code));
    expect(row.codeHash).not.toBe(result.code); // never the raw code
    expect(row.challenge).toBe(CHALLENGE);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('exchanges a valid code + verifier for the normal token pair (DESKTOP_LINK audited)', async () => {
    const { service, issuePair, audit, pair } = makeService();
    const { code } = await service.issueCode(USER_ID, CHALLENGE, {});

    const result = await service.exchange(code, VERIFIER, { ip: '1.1.1.1', userAgent: 'exe' });

    expect(result).toEqual(pair);
    expect(issuePair).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, email: 'viewer@example.com', roles: ['user'] }),
    );
    expect((audit as { record: jest.Mock }).record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DESKTOP_LINK', actorId: USER_ID }),
    );
  });

  it('rejects an unknown code with a generic 401', async () => {
    const { service, issuePair } = makeService();
    await expect(service.exchange('no-such-code', VERIFIER, {})).rejects.toThrow(
      new UnauthorizedException('Invalid or expired code'),
    );
    expect(issuePair).not.toHaveBeenCalled();
  });

  it('rejects an EXPIRED code with the same generic 401', async () => {
    const { service, issuePair } = makeService({
      record: (codeHash) => ({
        id: 'code-1',
        codeHash,
        userId: USER_ID,
        challenge: CHALLENGE,
        expiresAt: new Date(Date.now() - 1000),
        consumedAt: null,
      }),
    });
    await expect(service.exchange('whatever', VERIFIER, {})).rejects.toThrow(
      new UnauthorizedException('Invalid or expired code'),
    );
    expect(issuePair).not.toHaveBeenCalled();
  });

  it('rejects an already-CONSUMED code (single-use)', async () => {
    const { service, issuePair } = makeService({
      record: (codeHash) => ({
        id: 'code-1',
        codeHash,
        userId: USER_ID,
        challenge: CHALLENGE,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: new Date(),
      }),
    });
    await expect(service.exchange('whatever', VERIFIER, {})).rejects.toThrow(
      new UnauthorizedException('Invalid or expired code'),
    );
    expect(issuePair).not.toHaveBeenCalled();
  });

  it('rejects a BAD VERIFIER without consuming the code', async () => {
    const { service, updateMany, issuePair } = makeService();
    const { code } = await service.issueCode(USER_ID, CHALLENGE, {});

    await expect(service.exchange(code, 'w'.repeat(43), {})).rejects.toThrow(
      new UnauthorizedException('Invalid or expired code'),
    );
    expect(updateMany).not.toHaveBeenCalled();
    expect(issuePair).not.toHaveBeenCalled();
  });

  it('loses the race when another exchange claimed the code first', async () => {
    const { service, issuePair } = makeService({ claimCount: 0 });
    const { code } = await service.issueCode(USER_ID, CHALLENGE, {});

    await expect(service.exchange(code, VERIFIER, {})).rejects.toThrow(
      new UnauthorizedException('Invalid or expired code'),
    );
    expect(issuePair).not.toHaveBeenCalled();
  });

  it('refuses tokens for a suspended account with the same generic 401', async () => {
    const { service, issuePair } = makeService({
      user: { id: USER_ID, email: 'viewer@example.com', status: 'SUSPENDED', roles: [] },
    });
    const { code } = await service.issueCode(USER_ID, CHALLENGE, {});

    await expect(service.exchange(code, VERIFIER, {})).rejects.toThrow(
      new UnauthorizedException('Invalid or expired code'),
    );
    expect(issuePair).not.toHaveBeenCalled();
  });
});
