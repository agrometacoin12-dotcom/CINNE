import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import type { RegisterDto, LoginDto } from './dto/auth.dto';

// Mock argon2 so the suite has no native dependency and runs fast: hashing is a
// no-op and verification always succeeds (credential logic isn't under test here).
jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn().mockResolvedValue('hashed'),
  verify: jest.fn().mockResolvedValue(true),
}));

const TOKENS = {
  accessToken: 'a.b.c',
  refreshToken: 'r',
  tokenType: 'Bearer',
  expiresIn: 900,
};

function makeConfig(opts: {
  emailVerificationRequired?: boolean;
  driver?: 'local' | 'cognito';
}): ConfigService {
  return {
    get: (key: string, def?: unknown) => {
      if (key === 'authDriver') return opts.driver ?? 'local';
      if (key === 'emailVerificationRequired') return opts.emailVerificationRequired ?? false;
      return def;
    },
  } as unknown as ConfigService;
}

function makeDeps() {
  const users = {
    findByEmail: jest.fn(),
    createWithProfile: jest.fn(),
    markEmailVerified: jest.fn(),
  };
  const usersService = {};
  const tokens = { issuePair: jest.fn().mockResolvedValue(TOKENS) };
  const verification = { issue: jest.fn().mockResolvedValue('123456') };
  const mail = { sendVerificationCode: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const cognito = { signUp: jest.fn() };
  const events = { publish: jest.fn().mockResolvedValue(undefined) };
  return { users, usersService, tokens, verification, mail, audit, cognito, events };
}

function makeService(deps: ReturnType<typeof makeDeps>, config: ConfigService): AuthService {
  return new AuthService(
    deps.users as never,
    deps.usersService as never,
    deps.tokens as never,
    deps.verification as never,
    deps.mail as never,
    deps.audit as never,
    deps.cognito as never,
    deps.events as never,
    config,
  );
}

const registerDto: RegisterDto = {
  email: 'new@user.com',
  password: 'Str0ng!Pass',
  displayName: 'New User',
};

const ctx = { ip: '1.1.1.1', userAgent: 'jest' };

describe('AuthService.register', () => {
  it('auto-verifies and returns tokens when verification is not required (default)', async () => {
    const deps = makeDeps();
    deps.users.findByEmail.mockResolvedValue(null);
    deps.users.createWithProfile.mockResolvedValue({
      id: 'u1',
      email: 'new@user.com',
      status: 'PENDING',
      roles: [{ role: { name: 'user' } }],
    });
    deps.users.markEmailVerified.mockResolvedValue({ id: 'u1', status: 'ACTIVE' });

    const service = makeService(deps, makeConfig({ emailVerificationRequired: false }));
    const result = await service.register(registerDto, ctx);

    expect(deps.users.markEmailVerified).toHaveBeenCalledWith('u1');
    expect(deps.verification.issue).not.toHaveBeenCalled();
    expect(deps.mail.sendVerificationCode).not.toHaveBeenCalled();
    expect(deps.tokens.issuePair).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', email: 'new@user.com', roles: ['user'] }),
    );
    expect(deps.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'auth.register' }),
    );
    expect(deps.events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'user.registered' }),
    );
    expect(result).toEqual({ userId: 'u1', status: 'ACTIVE', tokens: TOKENS });
  });

  it('issues a code + mail and returns no tokens when verification is required', async () => {
    const deps = makeDeps();
    deps.users.findByEmail.mockResolvedValue(null);
    deps.users.createWithProfile.mockResolvedValue({
      id: 'u2',
      email: 'new@user.com',
      status: 'PENDING',
      roles: [{ role: { name: 'user' } }],
    });

    const service = makeService(deps, makeConfig({ emailVerificationRequired: true }));
    const result = await service.register(registerDto, ctx);

    expect(deps.verification.issue).toHaveBeenCalledWith('verify', 'new@user.com');
    expect(deps.mail.sendVerificationCode).toHaveBeenCalledWith('new@user.com', '123456');
    expect(deps.users.markEmailVerified).not.toHaveBeenCalled();
    expect(deps.tokens.issuePair).not.toHaveBeenCalled();
    expect(result).toEqual({ userId: 'u2', status: 'PENDING' });
  });
});

describe('AuthService.login', () => {
  const loginDto: LoginDto = { email: 'new@user.com', password: 'Str0ng!Pass' };

  const unverifiedUser = {
    id: 'u3',
    email: 'new@user.com',
    status: 'ACTIVE',
    emailVerified: false,
    passwordHash: 'hashed',
    roles: [{ role: { name: 'user' } }],
  };

  it('blocks an unverified account when verification is required', async () => {
    const deps = makeDeps();
    deps.users.findByEmail.mockResolvedValue(unverifiedUser);

    const service = makeService(deps, makeConfig({ emailVerificationRequired: true }));

    await expect(service.login(loginDto, ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.tokens.issuePair).not.toHaveBeenCalled();
  });

  it('lets an unverified account log in when verification is not required', async () => {
    const deps = makeDeps();
    deps.users.findByEmail.mockResolvedValue(unverifiedUser);

    const service = makeService(deps, makeConfig({ emailVerificationRequired: false }));
    const result = await service.login(loginDto, ctx);

    expect(result).toEqual(TOKENS);
    expect(deps.tokens.issuePair).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u3', roles: ['user'] }),
    );
  });
});
