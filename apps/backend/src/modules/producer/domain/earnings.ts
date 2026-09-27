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
  provider: 'MOCK' | 'PAYSTACK' | 'APPLE_IAP';
}

export const BPS = 10_000;

export function netOfStore(sale: Sale, appleCommissionBps: number): number {
  if (sale.provider !== 'APPLE_IAP') return sale.amountMinor;
  return Math.floor((sale.amountMinor * (BPS - appleCommissionBps)) / BPS);
}

export function producerShare(sale: Sale, shareBps: number, appleCommissionBps: number): number {
  return Math.floor((netOfStore(sale, appleCommissionBps) * shareBps) / BPS);
}

/** Available = earned − (confirmed + paid withdrawals + unexpired pending codes). */
export function availableMinor(earnedMinor: number, lockedMinor: number): number {
  return Math.max(0, earnedMinor - lockedMinor);
}
