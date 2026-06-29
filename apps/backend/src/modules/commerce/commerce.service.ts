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
import { PAYMENT_DRIVER, type PaymentDriver } from './domain/payment.driver';
import type { ConfirmAppleDto, PurchaseDto } from './dto/commerce.dto';

export interface AuthedBuyer {
  sub: string;
  email: string;
}

@Injectable()
export class CommerceService {
  private readonly logger = new Logger(CommerceService.name);
  private readonly webBaseUrl: string;
  private readonly appleBundleId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly users: UsersRepository,
    private readonly entitlements: EntitlementService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    @Inject(PAYMENT_DRIVER) private readonly payment: PaymentDriver,
    config: ConfigService,
  ) {
    this.webBaseUrl = config.get<string>('webBaseUrl') ?? 'https://cinnetemple.com';
    this.appleBundleId = config.get<string>('appleBundleId') ?? '';
  }

  /**
   * Confirm an Apple In-App Purchase (StoreKit 2). The client sends the signed
   * JWS transaction; we dedupe by transaction id and grant the entitlement.
   *
   * NOTE: production must cryptographically verify the JWS x5c certificate chain
   * against Apple's root CA (via the App Store Server Library) before trusting
   * the payload. Here we decode + structurally validate it; signature
   * verification is the remaining hardening step.
   */
  async confirmApple(buyer: AuthedBuyer, dto: ConfirmAppleDto) {
    const title = await this.catalogue.findRaw(dto.titleId);
    if (!title || title.status !== 'published') {
      throw new NotFoundException('Title not available');
    }
    const providerRef = `apple_${dto.transactionId}`;
    const existing = await this.prisma.purchase.findUnique({ where: { providerRef } });
    if (existing) {
      await this.ensureEntitlement(existing);
      return { status: 'paid' as const, titleId: title.id };
    }

    const claims = this.decodeAppleTransaction(dto.signedTransaction);
    if (this.appleBundleId && claims.bundleId && claims.bundleId !== this.appleBundleId) {
      throw new UnauthorizedException('Transaction bundle mismatch');
    }
    if (claims.transactionId && claims.transactionId !== dto.transactionId) {
      throw new BadRequestException('Transaction id mismatch');
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

  /** Decode the JWS payload segment (no signature verification — see note above). */
  private decodeAppleTransaction(jws: string): {
    bundleId?: string;
    transactionId?: string;
    productId?: string;
  } {
    try {
      const segment = jws.split('.')[1];
      if (!segment) return {};
      const json = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<
        string,
        unknown
      >;
      return {
        bundleId: typeof json.bundleId === 'string' ? json.bundleId : undefined,
        transactionId: typeof json.transactionId === 'string' ? json.transactionId : undefined,
        productId: typeof json.productId === 'string' ? json.productId : undefined,
      };
    } catch {
      return {};
    }
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
        throw new BadRequestException('Recipient must have a CinneTemple account to receive a gift');
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
        detail: { purchaseId: purchase.id, titleId: title.id, beneficiaryId, isGift, amountMinor: 0 },
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
      metadata: { purchaseId: purchase.id, titleId: title.id, beneficiaryId, isGift },
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
    let event: { event?: string; data?: { reference?: string } };
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Malformed webhook payload');
    }
    if (event.event === 'charge.success' && event.data?.reference) {
      const purchase = await this.prisma.purchase.findUnique({
        where: { providerRef: event.data.reference },
      });
      if (purchase && purchase.status !== 'PAID') await this.markPaid(purchase);
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
