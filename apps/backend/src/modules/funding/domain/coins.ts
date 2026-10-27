/** 1 coin = ₦1 = 100 kobo. */
export const KOBO_PER_COIN = 100;

/** Website (Paystack/Korapay) coin packs. App Store / Google Play packs are in store-coin-products.ts. */
export const COIN_PACKS = [200, 300, 500, 1000, 1500, 2000, 2500, 5000] as const;

export const COIN_LIMITS = {
  /** Smallest / largest single top-up, pack or custom amount (₦200 – ₦1,000,000). */
  topupMin: 200,
  topupMax: 1_000_000,
  /** Largest single user-to-user transfer. */
  transferMax: 1_000_000,
  /** Largest single contribution to a pool. */
  contributionMax: 10_000_000,
  /** Ceiling for a pool goal or payout (Postgres INT headroom). */
  poolMax: 1_000_000_000,
} as const;
