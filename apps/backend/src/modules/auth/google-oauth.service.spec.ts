import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleOAuthService } from './google-oauth.service';

describe('GoogleOAuthService (native sign-in)', () => {
  const originalFetch = global.fetch;

  const config = {
    get: (key: string) => {
      const map: Record<string, unknown> = {
        'google.clientId': 'web-client-id',
        'google.clientSecret': 'web-client-secret',
        'google.iosClientId': 'ios-client-id',
        apiPublicUrl: 'https://api.cinnetemple.com',
      };
      return map[key];
    },
  } as unknown as ConfigService;

  const existingUser = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'jane@example.com',
    emailVerified: true,
    roles: [{ role: { name: 'user' } }],
    profile: { displayName: 'Jane', avatarUrl: null, locale: 'en' },
  };

  const pair = { accessToken: 'a.b.c', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 };

  function makeService() {
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
    const service = new GoogleOAuthService(
      config,
      users as never,
      tokens as never,
      audit as never,
      events as never,
    );
    return { service, users, tokens, audit, events };
  }

  /** A valid `tokeninfo` payload; note strings for booleans/numbers. */
  const tokenInfo = (overrides: Record<string, unknown> = {}) => ({
    iss: 'https://accounts.google.com',
    aud: 'ios-client-id',
    sub: 'google-sub-1',
    exp: String(Math.floor(Date.now() / 1000) + 3600),
    email: 'jane@example.com',
    email_verified: 'true',
    name: 'Jane Doe',
    ...overrides,
  });

  const mockFetch = (status: number, body: unknown) => {
    const fn = jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('signs up a new user from a valid ID token', async () => {
    const { service, users, tokens, audit } = makeService();
    const fetchMock = mockFetch(200, tokenInfo());

    const result = await service.handleNativeSignIn('id-token', { ip: '1.1.1.1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/tokeninfo?id_token=id-token',
    );
    expect(users.createOAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'jane@example.com', providerId: 'google-sub-1' }),
    );
    expect(tokens.issuePair).toHaveBeenCalledWith(
      expect.objectContaining({ userId: existingUser.id, roles: ['user'] }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.google.register' }),
    );
    expect(result).toEqual(pair);
  });

  it('logs in an existing linked user (audit auth.google.login)', async () => {
    const { service, users, audit } = makeService();
    users.findByProvider.mockResolvedValue(existingUser);
    mockFetch(200, tokenInfo());

    await service.handleNativeSignIn('id-token', {});

    expect(users.createOAuthUser).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.google.login' }),
    );
  });

  it('rejects a token with the wrong audience', async () => {
    const { service, tokens } = makeService();
    mockFetch(200, tokenInfo({ aud: 'attacker-client-id' }));

    await expect(service.handleNativeSignIn('id-token', {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens.issuePair).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const { service, tokens } = makeService();
    mockFetch(200, tokenInfo({ exp: String(Math.floor(Date.now() / 1000) - 60) }));

    await expect(service.handleNativeSignIn('id-token', {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(tokens.issuePair).not.toHaveBeenCalled();
  });

  it('rejects a token Google itself refuses (non-200)', async () => {
    const { service } = makeService();
    mockFetch(400, { error: 'invalid_token' });

    await expect(service.handleNativeSignIn('bogus', {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses to link by email when Google has not verified the address', async () => {
    const { service, users } = makeService();
    users.findByEmail.mockResolvedValue(existingUser);
    mockFetch(200, tokenInfo({ email_verified: 'false' }));

    await expect(service.handleNativeSignIn('id-token', {})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.linkCredential).not.toHaveBeenCalled();
  });

  it('returns 503 when no Google client ID is configured', async () => {
    const bare = { get: () => undefined } as unknown as ConfigService;
    const { users, tokens, audit, events } = makeService();
    const service = new GoogleOAuthService(
      bare,
      users as never,
      tokens as never,
      audit as never,
      events as never,
    );

    await expect(service.handleNativeSignIn('id-token', {})).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
