CREATE TABLE "korapay_test_topups" (
 "reference" TEXT PRIMARY KEY, "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
 "coins" INTEGER NOT NULL CHECK ("coins" > 0), "amount_minor" INTEGER NOT NULL CHECK ("amount_minor" = "coins" * 100),
 "status" "CoinTopupStatus" NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "korapay_test_topups_user_id_idx" ON "korapay_test_topups"("user_id");
