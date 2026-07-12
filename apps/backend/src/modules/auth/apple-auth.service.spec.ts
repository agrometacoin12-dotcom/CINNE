import { generateKeyPairSync, sign as signPayload, type KeyObject } from 'node:crypto';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppleAuthService } from './apple-auth.service';

describe('AppleAuthService (native sign-in)', () => {
  const originalFetch = global.fetch;

  const config = {
    get: (key: string) => (key === 'appleBundleId' ? 'com.cinnetemple.app' : undefined),
  } as unknown as ConfigService;

  const existingUser = {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'jane@privaterelay.appleid.com',
    emailVerified: true,
    roles: [{ role: { name: 'user' } }],
    profile: { displayName: 'Jane', avatarUrl: null, locale: 'en' },
  };

  const pair = { accessToken: 'a.b.c', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 };

  // Real RSA keypair so the signature check is genuinely exercised.
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { privateKey: rogueKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'test-key-1';

  const jwks = () => ({
    keys: [{ ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid }],
  });

  /** Build a signed Apple identity token (JWS, RS256). */
  function makeToken(
    claims: Record<string, unknown> = {},
    opts: { signer?: KeyObject; headerKid?: string } = {},
  ): string {
    const header = { alg: 'RS256', kid: opts.headerKid ?? kid };
    const payload = {
      iss: 'https://appleid.apple.com',
      aud: 'com.cinnetemple.app',
      sub: 'apple-sub-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
      email: 'jane@privaterelay.appleid.com',
      email_verified: true,
      ...claims,
    };
    const h = Buffer.from(JSON.stringify(header)).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = signPayload('RSA-SHA256', Buffer.from(`${h}.${p}`), opts.signer ?? privateKey);
    return `${h}.${p}.${sig.toString('base64url')}`;
  }

  function makeService(cfg: ConfigService = config) {
    const users = {
      findByProvider: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      linkCredential: jest.fn().mockResolvedValue(undefined),
      markEmailVerified: jest.fn().mockResolvedValue(undefined),
      createOAuthUser: jest.fn().mockResolvedValue(existingUser),
    };
    const tokens = { issuePair: jest.fn().mockResolvedValue(pair) };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const events = { publish: jest.fn().mockResolvedValue(undefined) };
    const service = new AppleAuthService(
      cfg,
      users as never,
      tokens as never,
      audit as never,
      events as never,
    );
    return { service, users, tokens, audit, events };
  }

  /** Mock the JWKS endpoint (the only fetch this service performs). */
  const mockJwksFetch = (status = 200, body: unknown = jwks()) => {
    const fn = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('signs up a new user from a valid identity token (name from fullName)', async () => {
    const { service, users, tokens, audit, events } = makeService();
    const fetchMock = mockJwksFetch();

    const result = await service.handleNativeSignIn(makeToken(), 'Jane Doe', { ip: '1.1.1.1' });

    expect(fetchMock).toHaveBeenCalledWith('https://appleid.apple.com/auth/keys');
    expect(users.createOAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'jane@privaterelay.appleid.com',
        displayName: 'Jane Doe',
        providerId: 'apple-sub-1',
      }),
    );
    expect(tokens.issuePair).toHaveBeenCalledWith(
      expect.objectContaining({ userId: existingUser.id, roles: ['user'] }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.apple.register' }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'user.registered' }),
    );
    expect(result).toEqual(pair);
  });

  it('falls back to the email local part when no fullName is sent', async () => {
    const { service, users } = makeService();
    mockJwksFetch();

    await service.handleNativeSignIn(makeToken(), undefined, {});

    expect(users.createOAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'jane' }),
    );
  });

  it('logs in an existing linked user (audit auth.apple.login)', async () => {
    const { service, users, audit } = makeService();
    users.findByProvider.mockResolvedValue(existingUser);
    mockJwksFetch();

    const result = await service.handleNativeSignIn(makeToken(), undefined, {});

    expect(users.createOAuthUser).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.apple.login' }),
    );
    expect(result).toEqual(pair);
  });

  it('rejects a token with the wrong audience', async () => {
    const { service, tokens } = makeService();
    mockJwksFetch();

    await expect(
      service.handleNativeSignIn(makeToken({ aud: 'com.attacker.app' }), undefined, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.issuePair).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const { service, tokens } = makeService();
    mockJwksFetch();

    await expect(
      service.handleNativeSignIn(
        makeToken({ exp: Math.floor(Date.now() / 1000) - 60 }),
        undefined,
        {},
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.issuePair).not.toHaveBeenCalled();
  });

  it('rejects a token signed by the wrong key', async () => {
    const { service, tokens } = makeService();
    mockJwksFetch();

    await expect(
      service.handleNativeSignIn(makeToken({}, { signer: rogueKey }), undefined, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.issuePair).not.toHaveBeenCalled();
  });

  it('rejects a token whose kid Apple does not publish', async () => {
    const { service } = makeService();
    mockJwksFetch();

    await expect(
      service.handleNativeSignIn(makeToken({}, { headerKid: 'unknown-kid' }), undefined, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a tampered payload (signature no longer matches)', async () => {
    const { service } = makeService();
    mockJwksFetch();

    const [h, , s] = makeToken().split('.');
    const forged = Buffer.from(
      JSON.stringify({
        iss: 'https://appleid.apple.com',
        aud: 'com.cinnetemple.app',
        sub: 'someone-else',
        exp: Math.floor(Date.now() / 1000) + 3600,
        email: 'victim@example.com',
        email_verified: true,
      }),
    ).toString('base64url');

    await expect(
      service.handleNativeSignIn(`${h}.${forged}.${s}`, undefined, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses to link by email when the address is not verified', async () => {
    const { service, users } = makeService();
    users.findByEmail.mockResolvedValue(existingUser);
    mockJwksFetch();

    await expect(
      service.handleNativeSignIn(makeToken({ email_verified: false }), undefined, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.linkCredential).not.toHaveBeenCalled();
  });

  it('caches the JWKS across sign-ins', async () => {
    const { service, users } = makeService();
    users.findByProvider.mockResolvedValue(existingUser);
    const fetchMock = mockJwksFetch();

    await service.handleNativeSignIn(makeToken(), undefined, {});
    await service.handleNativeSignIn(makeToken(), undefined, {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when APPLE_BUNDLE_ID is not configured', async () => {
    const bare = { get: () => undefined } as unknown as ConfigService;
    const { service } = makeService(bare);

    await expect(service.handleNativeSignIn(makeToken(), undefined, {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
