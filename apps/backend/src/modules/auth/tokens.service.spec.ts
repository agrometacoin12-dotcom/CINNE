import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokensService } from './tokens.service';

describe('TokensService', () => {
  const config = {
    get: (key: string, fallback?: unknown) => {
      const map: Record<string, unknown> = {
        'jwt.accessTtl': 900,
        'jwt.refreshTtl': 2_592_000,
        'jwt.issuer': 'https://api.cinnetemple.com',
        'jwt.audience': 'cinnetemple-clients',
      };
      return map[key] ?? fallback;
    },
  } as unknown as ConfigService;

  const jwt = new JwtService({ secret: 'test-secret-test-secret' });

  const created: unknown[] = [];
  const prisma = {
    session: { create: jest.fn(async ({ data }: { data: unknown }) => created.push(data)) },
  } as never;

  const service = new TokensService(jwt, config, prisma);

  it('issues an access token and persists a hashed refresh token', async () => {
    const pair = await service.issuePair({
      userId: '11111111-1111-1111-1111-111111111111',
      email: 'a@b.com',
      roles: ['user'],
    });

    expect(pair.tokenType).toBe('Bearer');
    expect(pair.expiresIn).toBe(900);
    expect(pair.accessToken.split('.')).toHaveLength(3);

    const decoded = jwt.decode(pair.accessToken) as { sub: string; roles: string[] };
    expect(decoded.sub).toBe('11111111-1111-1111-1111-111111111111');
    expect(decoded.roles).toEqual(['user']);

    // refresh token must never be stored in plaintext
    const stored = created[0] as { refreshTokenHash: string };
    expect(stored.refreshTokenHash).not.toContain(pair.refreshToken);
    expect(stored.refreshTokenHash).toHaveLength(64); // sha-256 hex
  });
});
