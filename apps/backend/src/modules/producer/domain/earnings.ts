/**
 * Producer earnings from ticket sales, in kobo.
 *
 *   net      = ticket price, minus the store's commission for Apple In-App
 *              Purchases (Apple keeps it before we are paid; Paystack fees are
 *              absorbed by the platform and not deducted)
 *   producer = net × revenueShareBps ÷ 10,000   (default 9,000 = 90%)
 *
 * Each sale is floored to whole kobo, so the platform never pays out a fraction
 * it didn't receive.
 */
export interface Sale {
  amountMinor: number;
  provider: 'MOCK' | 'PAYSTACK' | 'KORAPAY' | 'APPLE_IAP' | 'GOOGLE_PLAY' | 'COINS';
}

export const BPS = 10_000;

export function netOfStore(
  sale: Sale,
  appleCommissionBps: number,
  googlePlayCommissionBps = appleCommissionBps,
): number {
  const commission =
    sale.provider === 'APPLE_IAP'
      ? appleCommissionBps
      : sale.provider === 'GOOGLE_PLAY'
        ? googlePlayCommissionBps
        : 0;
  return Math.floor((sale.amountMinor * (BPS - commission)) / BPS);
}

export function producerShare(
  sale: Sale,
  shareBps: number,
  appleCommissionBps: number,
  googlePlayCommissionBps = appleCommissionBps,
): number {
  return Math.floor(
    (netOfStore(sale, appleCommissionBps, googlePlayCommissionBps) * shareBps) / BPS,
  );
}

/** Available = earned − (confirmed + paid withdrawals + unexpired pending codes). */
export function availableMinor(earnedMinor: number, lockedMinor: number): number {
  return Math.max(0, earnedMinor - lockedMinor);
}
