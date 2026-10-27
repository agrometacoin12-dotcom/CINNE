import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Purchase } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EventBus } from '../../infra/events/event-bus';
import { AuditService } from '../auth/audit.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { UsersRepository } from '../users/users.repository';
import { EntitlementService } from './entitlement.service';
import { AppleIapVerifier } from './drivers/apple-iap.verifier';
import { PAYMENT_DRIVER, type PaymentDriver } from './domain/payment.driver';
import type { ConfirmAppleDto, PurchaseDto } from './dto/commerce.dto';
import { TOPUP_REF_PREFIX, WalletService, isUniqueViolation } from '../funding/wallet.service';

export interface AuthedBuyer {
  sub: string;
  email: string;
}

@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly users: UsersRepository,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly appleVerifier: AppleIapVerifier,
    @Inject(PAYMENT_DRIVER) private readonly payment: PaymentDriver,
    config: ConfigService,
    private readonly wallet: WalletService,
  ) {
    this.webBaseUrl = config.get<string>('webBaseUrl') ?? 'https://cinnetemple.com';
  }

  async purchaseWithCoins(userId: string, titleId: string, key: string) {
    const providerRef = `wallet_ticket_${userId}_${key}`;
    const replay = await this.prisma.purchase.findUnique({ where: { providerRef } });
    if (replay) {
      if (replay.titleId !== titleId) throw new BadRequestException('Purchase key belongs to another title');
      return { status: 'paid', titleId };
    }
    const title = await this.catalogue.findRaw(titleId);
    if (!title || title.status !== 'published') throw new NotFoundException('Title not available');
    if (title.currency !== 'NGN' || title.priceMinor < 0 || title.priceMinor % 100 !== 0) {
      throw new BadRequestException('This ticket is not available for whole-coin purchase');
    }
    const coins = title.priceMinor / 100;
    try {
      await this.prisma.$transaction(async tx => {
        // Serialize ticket purchases for this user so different taps cannot buy
        // the same active ticket twice. All wallet debit paths lock this row.
        await tx.$executeRaw`INSERT INTO coin_wallets (user_id, balance, refund_debt, created_at, updated_at)
          VALUES (${userId}::uuid, 0, 0, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`;
        await tx.$queryRaw`SELECT user_id FROM coin_wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;
        const existing = await tx.entitlement.findFirst({ where: { userId, titleId,
          status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
        if (existing) return;
        const purchase = await tx.purchase.create({ data: { userId, beneficiaryUserId: userId,
          titleId, titleName: title.title, amountMinor: title.priceMinor, currency: 'NGN',
          provider: 'COINS', providerRef, status: 'PAID', isGift: false, paidAt: new Date() } });
        if (coins > 0) await this.wallet.apply(tx, { userId, kind: 'TICKET_PURCHASE', delta: -coins,
          idempotencyKey: providerRef, note: title.title });
        await tx.entitlement.create({ data: { userId, titleId, purchaseId: purchase.id, status: 'ACTIVE' } });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const first = await this.prisma.purchase.findUnique({ where: { providerRef } });
      if (!first || first.titleId !== titleId || first.status !== 'PAID') throw error;
    }
    return { status: 'paid', titleId };
  }

  /** Review/TestFlight tickets have zero monetary value and no producer revenue. */
  async purchaseWithSandboxCoins(userId: string, titleId: string, key: string) {
    const title = await this.catalogue.findRaw(titleId);
    if (!title || title.status !== 'published') throw new NotFoundException('Title not available');
    if (title.currency !== 'NGN' || title.priceMinor < 0 || title.priceMinor % 100 !== 0) {
      throw new BadRequestException('This ticket is not available for whole-coin purchase');
    }
    const coins = title.priceMinor / 100;
    const providerRef = `sandbox_ticket_${userId}_${key}`;
    await this.prisma.$transaction(async tx => {
      const ownerLock = `apple_sandbox_user_${userId}`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerLock}, 0))::text`;
      const replay = await tx.purchase.findUnique({ where: { providerRef } });
      if (replay) {
        if (replay.titleId !== titleId) throw new BadRequestException('Purchase key belongs to another title');
        return;
      }
      if (await tx.entitlement.findFirst({ where: { userId, titleId, status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })) return;
      const credit = await tx.appleSandboxCoinPurchase.aggregate({ where: { userId, confirmed: true, refunded: false }, _sum: { coins: true } });
      const spent = await tx.appleSandboxCoinSpend.aggregate({ where: { userId }, _sum: { coins: true } });
      const kora = await tx.korapayTestTopup.aggregate({ where: { userId, status: 'PAID' }, _sum: { coins: true } });
      const available = (credit._sum.coins ?? 0) + (kora._sum.coins ?? 0) - (spent._sum.coins ?? 0);
      if (available < coins) throw new BadRequestException(`Not enough sandbox coins. This ticket costs ${coins} coins; your test balance is ${available}.`);
      const purchase = await tx.purchase.create({ data: { userId, beneficiaryUserId: userId, titleId,
        titleName: title.title, amountMinor: 0, currency: 'NGN', provider: 'MOCK', providerRef,
        status: 'PAID', isGift: false, paidAt: new Date() } });
      await tx.appleSandboxCoinSpend.create({ data: { id: providerRef, userId, coins } });
      await tx.entitlement.create({ data: { userId, titleId, purchaseId: purchase.id, status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
    });
    return { status: 'paid', titleId };
  }

  /**
   * Confirm an Apple In-App Purchase (StoreKit 2). The client sends the signed
   * JWS transaction, which we cryptographically verify with Apple's App Store
   * Server Library (x5c chain to Apple's root CAs, signature, bundle id, and
   * environment) BEFORE granting anything. Every trusted field — the
   * transaction id we dedupe on and the bundle id — comes from the verified
   * payload, never from the client-supplied JSON.
   *
   * Fails closed: if Apple purchases are not configured (`APPLE_BUNDLE_ID`
   * unset) the verifier throws 503 and no entitlement is granted.
   *
   * productId→titleId mapping: the catalogue has no per-title Apple product id,
   * so there is no mapping to enforce here. The grant is bound to the buyer's
   * requested (published) titleId; the verified productId is recorded for
   * forensics. Add an `appleProductId` column and check it here if a mapping is
   * introduced.
   */
  async confirmApple(buyer: AuthedBuyer, dto: ConfirmAppleDto) {
    const title = await this.catalogue.findRaw(dto.titleId);
    if (!title || title.status !== 'published') {
      throw new NotFoundException('Title not available');
    }

    // Verify first (throws 503 when unconfigured, 401 on any verification
    // failure) so a forged transaction never reaches the grant path.
    const verified = await this.appleVerifier.verifyTransaction(dto.signedTransaction);
    if (verified.transactionId !== dto.transactionId) {
      throw new BadRequestException('Transaction id mismatch');
    }

    // Dedupe on Apple's verified transaction id.
    const providerRef = `apple_${verified.transactionId}`;
    const existing = await this.prisma.purchase.findUnique({ where: { providerRef } });
    if (existing) {
      await this.ensureEntitlement(existing);
      return { status: 'paid' as const, titleId: title.id };
    }

    const purchase = await this.prisma.purchase.create({
      data: {
        userId: buyer.sub,
        beneficiaryUserId: buyer.sub,
        titleId: title.id,
        titleName: title.title,
        amountMinor: title.priceMinor,
        currency: title.currency,
        provider: 'APPLE_IAP',
        providerRef,
        status: 'PAID',
        isGift: false,
        paidAt: new Date(),
      },
    });
    await this.audit.record({
      actorId: buyer.sub,
      action: 'purchase.apple.confirmed',
      entity: 'Title',
      entityId: title.id,
      metadata: {
        transactionId: verified.transactionId,
        productId: verified.productId ?? null,
        purchaseId: purchase.id,
      },
    });
    await this.entitlements.grant(buyer.sub, title.id, purchase.id);
    await this.events.publish({
      name: 'purchase.paid',
      detail: {
        purchaseId: purchase.id,
        titleId: title.id,
        beneficiaryId: buyer.sub,
        isGift: false,
        amountMinor: title.priceMinor,
      },
    });
    return { status: 'paid' as const, titleId: title.id };
  }

  /**
   * Start a pay-per-view purchase. Supports gifting: when `beneficiaryEmail`
   * names another account, that user receives the entitlement and `isGift` is set.
   */
  async purchase(buyer: AuthedBuyer, dto: PurchaseDto) {
    const title = await this.catalogue.findRaw(dto.titleId);
    if (!title || title.status !== 'published') {
      throw new NotFoundException('Title not available for purchase');
    }

    // Resolve beneficiary (self by default; another account when gifting).
    let beneficiaryId = buyer.sub;
    let isGift = false;
    const giftEmail = dto.beneficiaryEmail?.trim().toLowerCase();
    if (giftEmail && giftEmail !== buyer.email.toLowerCase()) {
      const recipient = await this.users.findByEmail(giftEmail);
      if (!recipient) {
        throw new BadRequestException(
          'Recipient must have a CinneTemple account to receive a gift',
        );
      }
      beneficiaryId = recipient.id;
      isGift = true;
    }

    if (await this.entitlements.hasUsable(beneficiaryId, title.id)) {
      return { status: 'already_entitled' as const, titleId: title.id, isGift };
    }

    const amountMinor = title.priceMinor;
    const currency = title.currency;
    const reference = `ct_${randomUUID().replace(/-/g, '')}`;

    // Free title: entitle immediately, no PSP round-trip.
    if (amountMinor <= 0) {
      const purchase = await this.prisma.purchase.create({
        data: {
          userId: buyer.sub,
          beneficiaryUserId: beneficiaryId,
          titleId: title.id,
          titleName: title.title,
          amountMinor: 0,
          currency,
          provider: 'MOCK',
          providerRef: reference,
          status: 'PAID',
          isGift,
          paidAt: new Date(),
        },
      });
      await this.entitlements.grant(beneficiaryId, title.id, purchase.id);
      await this.events.publish({
        name: 'purchase.paid',
        detail: {
          purchaseId: purchase.id,
          titleId: title.id,
          beneficiaryId,
          isGift,
          amountMinor: 0,
        },
      });
      return { status: 'paid' as const, titleId: title.id, reference, isGift };
    }

    const purchase = await this.prisma.purchase.create({
      data: {
        userId: buyer.sub,
        beneficiaryUserId: beneficiaryId,
        titleId: title.id,
        titleName: title.title,
        amountMinor,
        currency,
        provider: this.payment.provider,
        providerRef: reference,
        status: 'PENDING',
        isGift,
      },
    });

    const init = await this.payment.initialize({
      reference,
      amountMinor,
      currency,
      email: buyer.email,
      callbackUrl: `${this.webBaseUrl}/payment/callback`,
      metadata: {
        purchaseId: purchase.id,
        titleId: title.id,
        titleName: title.title,
        beneficiaryId,
        isGift,
      },
    });

    await this.audit.record({
      actorId: buyer.sub,
      action: 'purchase.initiated',
      entity: 'Title',
      entityId: title.id,
      metadata: { reference, amountMinor, currency, isGift },
    });

    return {
      status: 'pending' as const,
      titleId: title.id,
      reference,
      amountMinor,
      currency,
      authorizationUrl: init.authorizationUrl,
      isGift,
    };
  }

  /** Confirm a purchase by reference (called from the payment-callback page). */
  async verify(reference: string) {
    const purchase = await this.prisma.purchase.findUnique({ where: { providerRef: reference } });
    if (!purchase) throw new NotFoundException('Purchase not found');
    if (purchase.status === 'PAID') {
      await this.ensureEntitlement(purchase);
      return { status: 'paid' as const, titleId: purchase.titleId };
    }
    const result = await this.payment.verify(reference);
    if (result.status === 'paid') {
      this.reconcileSettlement(purchase, result.amountMinor, result.currency);
      await this.markPaid(purchase);
      return { status: 'paid' as const, titleId: purchase.titleId };
    }
    if (result.status === 'failed') {
      await this.prisma.purchase.update({ where: { id: purchase.id }, data: { status: 'FAILED' } });
      return { status: 'failed' as const, titleId: purchase.titleId };
    }
    return { status: 'pending' as const, titleId: purchase.titleId };
  }

  /** Provider webhook (Paystack: charge.success). Body is the raw request string. */
  async handleWebhook(rawBody: string, signature: string | undefined) {
    if (!this.payment.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    let event: {
      event?: string;
      data?: { reference?: string; amount?: number; currency?: string };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Malformed webhook payload');
    }
    if (this.payment.provider === 'KORAPAY' && event.event === 'charge.success' && event.data?.reference) {
      // Kora signs data only. Independently query the charge so changing the
      // unsigned event type cannot turn a failed payment into a credit.
      const verified = await this.payment.verify(event.data.reference);
      if (verified.status !== 'paid') return { received: true };
      event.data.amount = verified.amountMinor;
      event.data.currency = verified.currency;
    }
    if (event.event === 'charge.success' && event.data?.reference?.startsWith(TOPUP_REF_PREFIX)) {
      // Coin top-up (funding engine) shares this Paystack account and webhook.
      await this.wallet.settleTopupFromWebhook(
        event.data.reference,
        event.data.amount,
        event.data.currency,
        this.payment.provider,
      );
    } else if (event.event === 'charge.success' && event.data?.reference) {
      const purchase = await this.prisma.purchase.findUnique({
        where: { providerRef: event.data.reference },
      });
      if (purchase && purchase.status !== 'PAID') {
        this.reconcileSettlement(purchase, event.data.amount, event.data.currency);
        await this.markPaid(purchase);
      }
    }
    return { received: true };
  }

  /** Titles the user currently holds the right to watch. */
  async myEntitlements(userId: string) {
    const ents = await this.entitlements.listForUser(userId);
    return Promise.all(
      ents.map(async (e) => ({
        titleId: e.titleId,
        status: e.status,
        startedAt: e.startedAt?.toISOString() ?? null,
        expiresAt: e.expiresAt?.toISOString() ?? null,
        title: await this.catalogue.summaryFor(e.titleId),
      })),
    );
  }

  /** Buyer's purchase history (incl. gifts sent). */
  async myPurchases(userId: string) {
    const purchases = await this.prisma.purchase.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return purchases.map((p) => ({
      id: p.id,
      titleId: p.titleId,
      titleName: p.titleName,
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.status,
      isGift: p.isGift,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  // ── internals ───────────────────────────────────────────────────────────────

  /**
   * Reconcile a provider-reported settlement against the stored purchase before
   * flipping it to PAID. Skips when the provider reports no amount/currency
   * (e.g. the mock driver). Throws — leaving the purchase unpaid — when a
   * reported amount or currency disagrees with what we recorded, so a tampered
   * or mismatched settlement can never grant an entitlement.
   */
  private reconcileSettlement(
    purchase: Purchase,
    amountMinor: number | undefined,
    currency: string | undefined,
  ): void {
    if (amountMinor === undefined && currency === undefined) return;
    const amountOk = amountMinor === undefined || amountMinor === purchase.amountMinor;
    const currencyOk =
      currency === undefined || currency.toUpperCase() === purchase.currency.toUpperCase();
    if (!amountOk || !currencyOk) {
      this.logger.error(
        `Payment reconciliation mismatch for purchase ${purchase.id}: provider reported ` +
          `${amountMinor ?? '—'} ${currency ?? '—'}, expected ` +
          `${purchase.amountMinor} ${purchase.currency}`,
      );
      throw new BadRequestException('Payment amount/currency mismatch');
    }
  }

  private async markPaid(purchase: Purchase) {
    await this.prisma.$transaction([
      this.prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: 'PAID', paidAt: new Date() },
      }),
      this.prisma.entitlement.upsert({
        where: { purchaseId: purchase.id },
        create: {
          userId: purchase.beneficiaryUserId,
          titleId: purchase.titleId,
          purchaseId: purchase.id,
          status: 'ACTIVE',
        },
        update: {},
      }),
    ]);
    await this.events.publish({
      name: 'purchase.paid',
      detail: {
        purchaseId: purchase.id,
        titleId: purchase.titleId,
        beneficiaryId: purchase.beneficiaryUserId,
        isGift: purchase.isGift,
        amountMinor: purchase.amountMinor,
      },
    });
    this.logger.log(`Purchase ${purchase.id} paid → entitlement granted`);
  }

  private async ensureEntitlement(purchase: Purchase) {
    await this.prisma.entitlement.upsert({
      where: { purchaseId: purchase.id },
      create: {
        userId: purchase.beneficiaryUserId,
        titleId: purchase.titleId,
        purchaseId: purchase.id,
        status: 'ACTIVE',
      },
      update: {},
    });
  }
}
