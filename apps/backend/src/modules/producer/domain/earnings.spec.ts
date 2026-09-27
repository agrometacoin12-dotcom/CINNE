import { availableMinor, netOfStore, producerShare } from './earnings';

describe('producer earnings', () => {
  it('pays 90% of a ₦2,500 Paystack ticket: ₦2,250', () => {
    expect(producerShare({ amountMinor: 250_000, provider: 'PAYSTACK' }, 9_000, 3_000)).toBe(
      225_000,
    );
  });

  it('takes the share of what Apple actually remits', () => {
    // ₦2,500 − 30% Apple = ₦1,750 net → 90% = ₦1,575
    const sale = { amountMinor: 250_000, provider: 'APPLE_IAP' as const };
    expect(netOfStore(sale, 3_000)).toBe(175_000);
    expect(producerShare(sale, 9_000, 3_000)).toBe(157_500);
    // Small Business Program (15%): ₦2,125 net → ₦1,912.50
    expect(producerShare(sale, 9_000, 1_500)).toBe(191_250);
  });

  it('floors to whole kobo', () => {
    expect(producerShare({ amountMinor: 333, provider: 'PAYSTACK' }, 9_000, 0)).toBe(299);
  });

  it('honours custom shares, including 0% and 100%', () => {
    const sale = { amountMinor: 100_000, provider: 'PAYSTACK' as const };
    expect(producerShare(sale, 7_000, 0)).toBe(70_000);
    expect(producerShare(sale, 0, 0)).toBe(0);
    expect(producerShare(sale, 10_000, 0)).toBe(100_000);
  });

  it('never reports a negative available balance', () => {
    expect(availableMinor(100_000, 40_000)).toBe(60_000);
    expect(availableMinor(100_000, 150_000)).toBe(0);
  });
});
