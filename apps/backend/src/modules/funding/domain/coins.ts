/** 1 coin = ₦1 = 100 kobo. */
export const KOBO_PER_COIN = 100;

export const COIN_LIMITS = {
  /** Smallest / largest single top-up (₦100 – ₦1,000,000). */
  topupMin: 100,
  topupMax: 1_000_000,
  /** Largest single user-to-user transfer. */
  transferMax: 1_000_000,
  /** Largest single contribution to a pool. */
  contributionMax: 10_000_000,
  /** Ceiling for a pool goal or payout (Postgres INT headroom). */
  poolMax: 1_000_000_000,
} as const;
