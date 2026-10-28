import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('Resend transactional mail', () => {
  const originalFetch = global.fetch;
  const make = (overrides = {}) => new MailService({ get: (key: string) => ({ env: 'production', 'mail.driver': 'resend', 'mail.from': 'no-reply@cinnetemple.com', 'mail.resendApiKey': 're_test_secret', ...overrides } as Record<string, unknown>)[key] } as ConfigService);
  afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });
  it('sends producer mail through Resend with an idempotency key', async () => {
    const send = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-id' }) });
    global.fetch = send;
    await make().sendPlain('producer@example.com', 'Your dashboard', 'Private link');
    const [url, options] = send.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.headers.Authorization).toBe('Bearer re_test_secret');
    expect(options.headers['Idempotency-Key']).toBeTruthy();
    expect(JSON.parse(options.body)).toEqual({ from: 'no-reply@cinnetemple.com', to: ['producer@example.com'], subject: 'Your dashboard', text: 'Private link', html: expect.stringContaining('Your dashboard') });
  });
  it('retries a transient failure with the same body and key', async () => {
    jest.useFakeTimers();
    const send = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ ok: true, json: async () => ({ id: 'email-id' }) });
    global.fetch = send;
    const result = make().sendPasswordResetCode('member@example.com', '123456');
    await jest.runAllTimersAsync(); await result;
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1].headers['Idempotency-Key']).toBe(send.mock.calls[1][1].headers['Idempotency-Key']);
    expect(send.mock.calls[0][1].body).toBe(send.mock.calls[1][1].body);
  });
  it('does not silently succeed or retry rejected sender configuration', async () => {
    const send = jest.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'unverified domain' }) }); global.fetch = send;
    await expect(make().sendVerificationCode('member@example.com', '123456')).rejects.toThrow('Email delivery is unavailable');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('fails clearly with no key and suppresses development delivery', async () => {
    const send = jest.fn(); global.fetch = send;
    await expect(make({ 'mail.resendApiKey': '' }).sendPlain('a@example.com','Subject','Body')).rejects.toThrow('not configured');
    await make({ env: 'development' }).sendPlain('a@example.com','Subject','Secret');
    expect(send).not.toHaveBeenCalled();
  });
  it('renders known templates locally instead of calling SES', async () => {
    const send = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-id' }) }); global.fetch = send;
    await make().sendTemplated('a@example.com','CinneTempleWelcome',{displayName:'Producer'});
    expect(JSON.parse(send.mock.calls[0][1].body).text).toContain('Producer');
    await expect(make().sendTemplated('a@example.com','Unknown',{})).rejects.toThrow('not configured');
  });
});
