CREATE TABLE "apple_sandbox_coin_purchases" (
 "transaction_id" TEXT PRIMARY KEY, "user_id" UUID NOT NULL,
 "coins" INTEGER NOT NULL CHECK ("coins" IN (500,1000,2500,5000)),
 "confirmed" BOOLEAN NOT NULL DEFAULT false, "refunded" BOOLEAN NOT NULL DEFAULT false,
 "signed_at" BIGINT NOT NULL DEFAULT 0, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "apple_sandbox_coin_purchases_user_id_idx" ON "apple_sandbox_coin_purchases"("user_id");
CREATE TABLE "apple_sandbox_coin_spends" (
 "id" TEXT PRIMARY KEY, "user_id" UUID NOT NULL, "coins" INTEGER NOT NULL CHECK ("coins" >= 0),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "apple_sandbox_coin_spends_user_id_idx" ON "apple_sandbox_coin_spends"("user_id");
