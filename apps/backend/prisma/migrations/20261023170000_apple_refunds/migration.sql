ALTER TYPE "CoinLedgerKind" ADD VALUE 'APPLE_REFUND';
ALTER TYPE "CoinLedgerKind" ADD VALUE 'APPLE_REFUND_REVERSAL';
ALTER TYPE "CoinTopupStatus" ADD VALUE 'REFUNDED';
-- Preserve the spendable-balance constraint; refunded spent coins become debt.
ALTER TABLE "coin_wallets" ADD COLUMN "refund_debt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "coin_wallets" ADD CONSTRAINT "coin_wallets_refund_debt_valid"
 CHECK ("refund_debt" >= 0 AND ("refund_debt" = 0 OR "balance" = 0));
ALTER TABLE "coin_ledger" DROP CONSTRAINT "coin_ledger_delta_nonzero";
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_delta_nonzero" CHECK ("delta" <> 0);
CREATE TABLE "apple_coin_refund_states" (
 "transaction_id" TEXT PRIMARY KEY, "product_id" TEXT NOT NULL,
 "user_id" UUID NOT NULL, "refunded" BOOLEAN NOT NULL,
 "signed_at" BIGINT NOT NULL, "notification_id" TEXT NOT NULL,
 "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "apple_store_notifications" (
 "id" TEXT PRIMARY KEY, "type" TEXT NOT NULL, "transaction_id" TEXT,
 "signed_at" BIGINT NOT NULL, "outcome" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
