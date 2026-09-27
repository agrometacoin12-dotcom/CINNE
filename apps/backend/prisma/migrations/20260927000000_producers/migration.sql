-- CreateEnum
CREATE TYPE "ProducerWithdrawalStatus" AS ENUM ('AWAITING_CONFIRMATION', 'REQUESTED', 'PAID', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "producers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "key_hash" TEXT NOT NULL,
    "key_issued_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producer_titles" (
    "title_id" UUID NOT NULL,
    "producer_id" UUID NOT NULL,
    "revenue_share_bps" INTEGER NOT NULL DEFAULT 9000,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producer_titles_pkey" PRIMARY KEY ("title_id")
);

-- CreateTable
CREATE TABLE "producer_withdrawals" (
    "id" UUID NOT NULL,
    "producer_id" UUID NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "status" "ProducerWithdrawalStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "code_hash" TEXT,
    "code_expires_at" TIMESTAMP(3),
    "code_attempts" INTEGER NOT NULL DEFAULT 0,
    "requested_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "transfer_ref" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producer_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "producers_email_key" ON "producers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "producers_key_hash_key" ON "producers"("key_hash");

-- CreateIndex
CREATE INDEX "producer_titles_producer_id_idx" ON "producer_titles"("producer_id");

-- CreateIndex
CREATE INDEX "producer_withdrawals_producer_id_created_at_idx" ON "producer_withdrawals"("producer_id", "created_at");

-- CreateIndex
CREATE INDEX "producer_withdrawals_status_idx" ON "producer_withdrawals"("status");

-- AddForeignKey
ALTER TABLE "producer_titles" ADD CONSTRAINT "producer_titles_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "producers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producer_withdrawals" ADD CONSTRAINT "producer_withdrawals_producer_id_fkey" FOREIGN KEY ("producer_id") REFERENCES "producers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Money invariants.
ALTER TABLE "producer_titles" ADD CONSTRAINT "producer_titles_share_bounds" CHECK ("revenue_share_bps" BETWEEN 0 AND 10000);
ALTER TABLE "producer_withdrawals" ADD CONSTRAINT "producer_withdrawals_amount_pos" CHECK ("amount_minor" > 0);
ALTER TABLE "producer_withdrawals" ADD CONSTRAINT "producer_withdrawals_nuban" CHECK ("account_number" ~ '^[0-9]{10}$');
