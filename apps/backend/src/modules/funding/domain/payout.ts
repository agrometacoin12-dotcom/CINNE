/**
 * Pool payout math. 1 coin = ₦1, so a payout of P coins over a pool of T coins
 * values each pooled coin at P ÷ T. A backer holding c coins is owed c × P ÷ T.
 *
 * Shares are whole coins, so the fractional parts are settled with the
 * largest-remainder method: everyone gets floor(c × P ÷ T), then the leftover
 * coins (always fewer than the number of backers) go one each to the largest
 * fractional remainders. The shares therefore sum to exactly P — nothing is
 * minted or lost to rounding. Ties break by stake size, then id, so a rerun
 * over the same inputs always produces the same split.
 *
 * All arithmetic is BigInt: c × P can exceed 2^53 for large pools.
 */
export interface Stake {
  id: string;
  coins: number;
}

export interface Share {
  id: string;
  coins: number;
  payoutCoins: number;
}

export interface PayoutPlan {
  totalCoins: number;
  payoutCoins: number;
  /** Naira (= coins) each pooled coin earns, as a decimal string, 4dp. */
  nairaPerCoin: string;
  shares: Share[];
}

export function planPayout(stakes: Stake[], payoutCoins: number): PayoutPlan {
  if (!Number.isSafeInteger(payoutCoins) || payoutCoins < 0) {
    throw new RangeError('payoutCoins must be a non-negative integer');
  }
  const live = stakes.filter((s) => s.coins > 0);
  const totalCoins = live.reduce((sum, s) => sum + s.coins, 0);
  if (totalCoins === 0) {
    return { totalCoins: 0, payoutCoins, nairaPerCoin: '0.0000', shares: [] };
  }

  const P = BigInt(payoutCoins);
  const T = BigInt(totalCoins);
  const rows = live.map((s) => {
    const product = BigInt(s.coins) * P;
    return { id: s.id, coins: s.coins, base: product / T, remainder: product % T };
  });

  let leftover = P - rows.reduce((sum, r) => sum + r.base, 0n);
  const order = [...rows].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    if (a.coins !== b.coins) return b.coins - a.coins;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const bonus = new Set<string>();
  for (const r of order) {
    if (leftover === 0n) break;
    bonus.add(r.id);
    leftover -= 1n;
  }

  return {
    totalCoins,
    payoutCoins,
    nairaPerCoin: ratio(P, T),
    shares: rows.map((r) => ({
      id: r.id,
      coins: r.coins,
      payoutCoins: Number(r.base + (bonus.has(r.id) ? 1n : 0n)),
    })),
  };
}

/** P ÷ T rounded half-up to 4 decimal places, without floating point. */
export function ratio(P: bigint, T: bigint): string {
  const scaled = (P * 100_000n) / T; // one extra digit for rounding
  const rounded = (scaled + 5n) / 10n;
  const whole = rounded / 10_000n;
  const frac = (rounded % 10_000n).toString().padStart(4, '0');
  return `${whole}.${frac}`;
}
