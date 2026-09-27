/**
 * Funding engine contracts. Coins: 1 coin = ₦1. Viewers buy coins, fund a film's
 * pool, claim refunds (always back as coins) and send coins to each other. When a
 * pool pays out, each pooled coin is worth payoutCoins ÷ totalCoins.
 */

export type CoinLedgerKind =
  'TOPUP' | 'POOL_FUND' | 'POOL_REFUND' | 'POOL_PAYOUT' | 'TRANSFER_OUT' | 'TRANSFER_IN';

export interface CoinLedgerEntry {
  id: string;
  kind: CoinLedgerKind;
  /** Signed: + credit, − debit. */
  delta: number;
  balanceAfter: number;
  poolId: string | null;
  poolName: string | null;
  counterparty: string | null;
  note: string | null;
  createdAt: string;
}

export interface WalletSummary {
  balance: number;
  nairaPerCoin: 1;
  entries: CoinLedgerEntry[];
}

export interface TopupStart {
  status: 'pending';
  reference: string;
  coins: number;
  amountMinor: number;
  authorizationUrl: string | null;
}

export interface TopupResult {
  status: 'paid' | 'failed' | 'pending';
  coins: number;
  balance: number;
}

export interface TransferResult {
  status: 'sent';
  coins: number;
  balance: number;
  recipient: string;
}

export type FundingPoolStatus = 'OPEN' | 'CLOSED' | 'PAID_OUT' | 'CANCELLED';

export interface FundingPool {
  id: string;
  titleId: string | null;
  name: string;
  description: string | null;
  status: FundingPoolStatus;
  goalCoins: number | null;
  totalCoins: number;
  backers: number;
  payoutCoins: number | null;
  /** Decimal string (4dp), set once the pool is paid out. */
  nairaPerCoin: string | null;
  closesAt: string | null;
  createdAt: string;
  paidOutAt: string | null;
}

export interface PoolStake {
  /** Live stake (contributed − refunded). */
  coins: number;
  contributedCoins: number;
  refundedCoins: number;
  payoutCoins: number | null;
}

export interface FundingPoolDetail extends FundingPool {
  myStake: PoolStake | null;
}

export interface PayoutPlan {
  poolId: string;
  totalCoins: number;
  payoutCoins: number;
  nairaPerCoin: string;
  backers: { userId: string; name: string; coins: number; payoutCoins: number }[];
}
