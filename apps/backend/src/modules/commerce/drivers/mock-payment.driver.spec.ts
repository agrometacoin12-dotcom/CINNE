import { MockPaymentDriver } from './mock-payment.driver';

const input = {
  reference: 'ct_abc123',
  amountMinor: 250_000,
  currency: 'NGN',
  email: 'buyer@test.com',
  callbackUrl: 'https://www.cinnetemple.com/payment/callback',
  metadata: { titleName: 'The Fisherman & The King', titleId: 't-1' },
};

describe('MockPaymentDriver', () => {
  it('sends the buyer to the web mock-checkout page with reference, title, amount, currency', async () => {
    const driver = new MockPaymentDriver('https://www.cinnetemple.com');
    const result = await driver.initialize(input);

    expect(result.reference).toBe('ct_abc123');
    const url = new URL(result.authorizationUrl!);
    expect(url.origin + url.pathname).toBe('https://www.cinnetemple.com/payment/mock-checkout');
    expect(url.searchParams.get('reference')).toBe('ct_abc123');
    expect(url.searchParams.get('title')).toBe('The Fisherman & The King');
    expect(url.searchParams.get('amount')).toBe('250000');
    expect(url.searchParams.get('currency')).toBe('NGN');
  });

  it('tolerates a trailing slash on the web base URL and a missing title name', async () => {
    const driver = new MockPaymentDriver('https://www.cinnetemple.com/');
    const result = await driver.initialize({ ...input, metadata: {} });

    const url = new URL(result.authorizationUrl!);
    expect(url.pathname).toBe('/payment/mock-checkout');
    expect(result.authorizationUrl).not.toContain('//payment');
    expect(url.searchParams.get('title')).toBe('');
  });

  it('keeps verify semantics: always paid, regardless of extra query params upstream', async () => {
    const driver = new MockPaymentDriver('https://www.cinnetemple.com');
    await expect(driver.verify('ct_abc123')).resolves.toEqual({ status: 'paid' });
    expect(driver.verifyWebhookSignature()).toBe(true);
  });
});
