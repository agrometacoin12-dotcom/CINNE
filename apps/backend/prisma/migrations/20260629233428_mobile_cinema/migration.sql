-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MOCK', 'PAYSTACK', 'APPLE_IAP');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONSUMED', 'REVOKED');

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "beneficiary_user_id" UUID NOT NULL,
    "title_id" UUID NOT NULL,
    "title_name" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "provider" "PaymentProvider" NOT NULL,
    "provider_ref" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "is_gift" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP(3),

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title_id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "premiere_chat_messages" (
    "id" UUID NOT NULL,
    "title_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "premiere_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_provider_ref_key" ON "purchases"("provider_ref");

-- CreateIndex
CREATE INDEX "purchases_user_id_idx" ON "purchases"("user_id");

-- CreateIndex
CREATE INDEX "purchases_beneficiary_user_id_idx" ON "purchases"("beneficiary_user_id");

-- CreateIndex
CREATE INDEX "purchases_title_id_idx" ON "purchases"("title_id");

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "entitlements_purchase_id_key" ON "entitlements"("purchase_id");

-- CreateIndex
CREATE INDEX "entitlements_user_id_title_id_idx" ON "entitlements"("user_id", "title_id");

-- CreateIndex
CREATE INDEX "entitlements_status_idx" ON "entitlements"("status");

-- CreateIndex
CREATE INDEX "premiere_chat_messages_title_id_created_at_idx" ON "premiere_chat_messages"("title_id", "created_at");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_beneficiary_user_id_fkey" FOREIGN KEY ("beneficiary_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "premiere_chat_messages" ADD CONSTRAINT "premiere_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
