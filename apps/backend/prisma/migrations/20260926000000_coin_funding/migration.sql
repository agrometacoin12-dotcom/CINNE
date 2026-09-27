-- CreateEnum
CREATE TYPE "CoinLedgerKind" AS ENUM ('TOPUP', 'POOL_FUND', 'POOL_REFUND', 'POOL_PAYOUT', 'TRANSFER_OUT', 'TRANSFER_IN');

-- CreateEnum
CREATE TYPE "CoinTopupStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "FundingPoolStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID_OUT', 'CANCELLED');

-- CreateTable
CREATE TABLE "coin_wallets" (
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coin_wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "coin_ledger" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "CoinLedgerKind" NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "pool_id" UUID,
    "counterparty_user_id" UUID,
    "note" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coin_topups" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "coins" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "provider" "PaymentProvider" NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "CoinTopupStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "coin_topups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_pools" (
    "id" UUID NOT NULL,
    "title_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "goal_coins" INTEGER,
    "total_coins" INTEGER NOT NULL DEFAULT 0,
    "status" "FundingPoolStatus" NOT NULL DEFAULT 'OPEN',
    "payout_coins" INTEGER,
    "closes_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "paid_out_at" TIMESTAMP(3),

    CONSTRAINT "funding_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_contributions" (
    "id" UUID NOT NULL,
    "pool_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "refunded_coins" INTEGER NOT NULL DEFAULT 0,
    "payout_coins" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pool_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coin_ledger_idempotency_key_key" ON "coin_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "coin_ledger_user_id_created_at_idx" ON "coin_ledger"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "coin_ledger_pool_id_idx" ON "coin_ledger"("pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "coin_topups_reference_key" ON "coin_topups"("reference");

-- CreateIndex
CREATE INDEX "coin_topups_user_id_idx" ON "coin_topups"("user_id");

-- CreateIndex
CREATE INDEX "coin_topups_status_idx" ON "coin_topups"("status");

-- CreateIndex
CREATE INDEX "funding_pools_status_idx" ON "funding_pools"("status");

-- CreateIndex
CREATE INDEX "funding_pools_title_id_idx" ON "funding_pools"("title_id");

-- CreateIndex
CREATE INDEX "pool_contributions_user_id_idx" ON "pool_contributions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "pool_contributions_pool_id_user_id_key" ON "pool_contributions"("pool_id", "user_id");

-- AddForeignKey
ALTER TABLE "coin_wallets" ADD CONSTRAINT "coin_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_topups" ADD CONSTRAINT "coin_topups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_contributions" ADD CONSTRAINT "pool_contributions_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "funding_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pool_contributions" ADD CONSTRAINT "pool_contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Money invariants enforced by the database, not just the service layer:
-- no negative balances, no refunds beyond what was contributed, positive top-ups.
ALTER TABLE "coin_wallets" ADD CONSTRAINT "coin_wallets_balance_nonneg" CHECK ("balance" >= 0);
ALTER TABLE "coin_topups" ADD CONSTRAINT "coin_topups_coins_pos" CHECK ("coins" > 0 AND "amount_minor" = "coins" * 100);
ALTER TABLE "funding_pools" ADD CONSTRAINT "funding_pools_total_nonneg" CHECK ("total_coins" >= 0);
ALTER TABLE "funding_pools" ADD CONSTRAINT "funding_pools_payout_nonneg" CHECK ("payout_coins" IS NULL OR "payout_coins" >= 0);
ALTER TABLE "pool_contributions" ADD CONSTRAINT "pool_contributions_refund_bounds" CHECK ("refunded_coins" >= 0 AND "refunded_coins" <= "coins");
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_delta_nonzero" CHECK ("delta" <> 0 AND "balance_after" >= 0);
