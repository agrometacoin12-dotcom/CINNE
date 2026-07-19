import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';

describe('AuthController — Google callback state check', () => {
  const web = 'https://www.cinnetemple.com';

  const config = {
    get: (key: string) => (key === 'webBaseUrl' ? web : undefined),
  } as unknown as ConfigService;

  const pair = { accessToken: 'a.b.c', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900 };

  function makeController() {
    const google = { handleCallback: jest.fn().mockResolvedValue(pair) };
    const controller = new AuthController(
      {} as never,
      google as never,
      {} as never,
      {} as never,
      config,
    );
    return { controller, google };
  }

  const resMock = () =>
    ({
      redirect: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    }) as unknown as Response;

  const reqWith = (cookie?: string) =>
    ({ headers: cookie ? { cookie } : {}, ip: '1.1.1.1' }) as unknown as Request;

  it('rejects when the state cookie is missing', async () => {
    const { controller, google } = makeController();
    const res = resMock();

    await controller.googleCallback('auth-code', 'some-state', undefined, reqWith(), res);

    expect(res.redirect).toHaveBeenCalledWith(`${web}/login?error=state_mismatch`);
    expect(google.handleCallback).not.toHaveBeenCalled();
  });

  it('rejects when the state param is missing', async () => {
    const { controller, google } = makeController();
    const res = resMock();

    await controller.googleCallback('auth-code', undefined, undefined, reqWith('g_state=abc'), res);

    expect(res.redirect).toHaveBeenCalledWith(`${web}/login?error=state_mismatch`);
    expect(google.handleCallback).not.toHaveBeenCalled();
  });

  it('rejects when cookie and param differ', async () => {
    const { controller, google } = makeController();
    const res = resMock();

    await controller.googleCallback('auth-code', 'other', undefined, reqWith('g_state=abc'), res);

    expect(res.redirect).toHaveBeenCalledWith(`${web}/login?error=state_mismatch`);
    expect(google.handleCallback).not.toHaveBeenCalled();
  });

  it('proceeds when cookie and param match', async () => {
    const { controller, google } = makeController();
    const res = resMock();

    await controller.googleCallback('auth-code', 'abc', undefined, reqWith('g_state=abc'), res);

    expect(google.handleCallback).toHaveBeenCalledWith('auth-code', expect.anything());
    expect(res.redirect).toHaveBeenCalledWith(expect.stringContaining(`${web}/auth/callback#`));
  });
});
