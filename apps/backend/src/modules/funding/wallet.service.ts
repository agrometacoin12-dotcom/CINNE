import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoinLedgerKind, CoinTopup, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EventBus } from '../../infra/events/event-bus';
import { AuditService } from '../auth/audit.service';
import { UsersRepository } from '../users/users.repository';
import { PAYMENT_DRIVER, type PaymentDriver } from '../commerce/domain/payment.driver';
import { PaystackPaymentDriver } from '../commerce/drivers/paystack-payment.driver';
import { KorapayPaymentDriver } from '../commerce/drivers/korapay-payment.driver';
import { COIN_LIMITS, COIN_PACKS, KOBO_PER_COIN } from './domain/coins';

export type Tx = Prisma.TransactionClient;

export interface LedgerWrite {
  userId: string;
  kind: CoinLedgerKind;
  /** Signed: + credit, − debit. */
  delta: number;
  idempotencyKey: string;
  poolId?: string;
  counterpartyUserId?: string;
  note?: string;
}

export interface CoinBuyer {
  sub: string;
  email: string;
}

/** Coin top-up references are prefixed so the shared Paystack webhook can route them. */
export const TOPUP_REF_PREFIX = 'coin_';

/**
 * The coin wallet. 1 coin = ₦1. Every balance change goes through `apply()`,
 * which moves the balance and writes the matching ledger entry in the caller's
 * transaction — the ledger is the audit trail and always sums to the balance.
 *
 * Lock order (to stay deadlock-free alongside FundingService): pool row first,
 * then wallet rows in ascending user id.
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersRepository,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    @Inject(PAYMENT_DRIVER) private readonly payment: PaymentDriver,
    private readonly config: ConfigService,
  ) {
    this.webBaseUrl = config.get<string>('webBaseUrl') ?? 'https://cinnetemple.com';
  }

  // ── Ledger primitive ────────────────────────────────────────────────────

  /**
   * Spendable balance remains nonnegative at the database level. Verified
   * refunds can create separate debt; future credits repay it under a row lock.
   * Ledger balances are net of debt. Ordinary debits cannot overdraw.
   */
  async apply(tx: Tx, w: LedgerWrite): Promise<number> {
    if (!Number.isSafeInteger(w.delta) || w.delta === 0) {
      throw new Error(`Invalid ledger delta ${w.delta}`);
    }
    let balance: number;
    if (w.delta > 0 || w.kind === 'APPLE_REFUND') {
      // Native conflict handling: Prisma's empty-update upsert can race when
      // simultaneous credits create a recipient's first wallet.
      await tx.$executeRaw`INSERT INTO coin_wallets (user_id, balance, refund_debt, created_at, updated_at)
        VALUES (${w.userId}::uuid, 0, 0, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`;
      const [current] = await tx.$queryRaw<Array<{ balance: number; refund_debt: number }>>`
        SELECT balance, refund_debt FROM coin_wallets WHERE user_id = ${w.userId}::uuid FOR UPDATE`;
      if (!current) throw new Error('Wallet disappeared during settlement');
      balance = current.balance - current.refund_debt + w.delta;
      await tx.coinWallet.update({
        where: { userId: w.userId },
        data: { balance: Math.max(0, balance), refundDebt: Math.max(0, -balance) },
      });
    } else {
      const amount = -w.delta;
      const res = await tx.coinWallet.updateMany({
        where: { userId: w.userId, balance: { gte: amount }, refundDebt: 0 },
        data: { balance: { decrement: amount } },
      });
      if (res.count === 0) throw new BadRequestException('Not enough coins');
      const wallet = await tx.coinWallet.findUniqueOrThrow({ where: { userId: w.userId } });
      balance = wallet.balance;
    }
    await tx.coinLedgerEntry.create({
      data: {
        userId: w.userId,
        kind: w.kind,
        delta: w.delta,
        balanceAfter: balance,
        poolId: w.poolId,
        counterpartyUserId: w.counterpartyUserId,
        note: w.note,
        idempotencyKey: w.idempotencyKey,
      },
    });
    return balance;
  }

  // ── Reads ───────────────────────────────────────────────────────────────

  async summary(userId: string) {
    const [wallet, entries] = await Promise.all([
      this.prisma.coinWallet.findUnique({ where: { userId } }),
      this.prisma.coinLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const counterpartyIds = [
      ...new Set(entries.map((e) => e.counterpartyUserId).filter((v): v is string => !!v)),
    ];
    const poolIds = [...new Set(entries.map((e) => e.poolId).filter((v): v is string => !!v))];
    const [people, pools] = await Promise.all([
      counterpartyIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: counterpartyIds } },
            select: { id: true, email: true, profile: { select: { displayName: true } } },
          })
        : [],
      poolIds.length
        ? this.prisma.fundingPool.findMany({
            where: { id: { in: poolIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const personName = new Map(
      people.map((p) => [p.id, p.profile?.displayName ?? p.email.split('@')[0]]),
    );
    const poolName = new Map(pools.map((p) => [p.id, p.name]));
    return {
      balance: (wallet?.balance ?? 0) - (wallet?.refundDebt ?? 0),
      refundDebt: wallet?.refundDebt ?? 0,
      nairaPerCoin: 1,
      entries: entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        delta: e.delta,
        balanceAfter: e.balanceAfter,
        poolId: e.poolId,
        poolName: e.poolId ? (poolName.get(e.poolId) ?? null) : null,
        counterparty: e.counterpartyUserId ? (personName.get(e.counterpartyUserId) ?? null) : null,
        note: e.note,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async purchaseHistory(userId: string) {
    const [live, appleTest, browserTest] = await Promise.all([
      this.prisma.coinTopup.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.appleSandboxCoinPurchase.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 100 }),
      this.prisma.korapayTestTopup.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return [
      ...live.map(p => ({ id: p.id, coins: p.coins, status: p.status,
        source: p.provider === 'APPLE_IAP' ? 'App Store' : p.provider === 'GOOGLE_PLAY' ? 'Google Play' : 'Browser payment',
        environment: 'Production', createdAt: p.createdAt.toISOString() })),
      ...appleTest.map(p => ({ id: `apple-test:${p.transactionId}`, coins: p.coins,
        status: p.refunded ? 'REFUNDED' : p.confirmed ? 'PAID' : 'PENDING', source: 'App Store',
        environment: 'Sandbox', createdAt: p.updatedAt.toISOString() })),
      ...browserTest.map(p => ({ id: p.reference, coins: p.coins, status: p.status,
        source: 'Browser payment', environment: 'Sandbox', createdAt: p.createdAt.toISOString() })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  }

  // ── Top-ups (naira → coins via Paystack) ────────────────────────────────

  private gateway(provider: string): PaymentDriver {
    if (!['PAYSTACK', 'KORAPAY'].includes(provider)) throw new BadRequestException('Choose a supported payment provider.');
    const key = this.config.get<string>(provider === 'PAYSTACK' ? 'paystack.secretKey' : 'korapay.secretKey') ?? '';
    // These routes always credit real wallets, even outside production.
    if (!key.startsWith('sk_live_')) throw new ServiceUnavailableException('This payment provider is not available yet.');
    return provider === 'PAYSTACK' ? new PaystackPaymentDriver(key)
      : new KorapayPaymentDriver(key, `${this.config.get<string>('apiBaseUrl') ?? 'https://api.cinnetemple.com'}/v1/wallet/webhooks/korapay`);
  }

  checkoutOptions() {
    const providers = (['PAYSTACK', 'KORAPAY'] as const).map(provider => ({
      provider, enabled: (this.config.get<string>(provider === 'PAYSTACK' ? 'paystack.secretKey' : 'korapay.secretKey') ?? '').startsWith('sk_live_'),
    }));
    return { enabled: providers.some(p => p.enabled), provider: providers.find(p => p.enabled)?.provider ?? 'KORAPAY',
      providers, currency: 'NGN', nairaPerCoin: 1, packs: [...COIN_PACKS],
      custom: { min: COIN_LIMITS.topupMin, max: COIN_LIMITS.topupMax } };
  }

  async startTopup(buyer: CoinBuyer, coins: number, provider?: string) {
    const payment = this.gateway(provider ?? this.checkoutOptions().provider);
    assertCoins(coins, COIN_LIMITS.topupMin, COIN_LIMITS.topupMax, 'Top-up');
    const reference = `${TOPUP_REF_PREFIX}${randomUUID().replace(/-/g, '')}`;
    const amountMinor = coins * KOBO_PER_COIN;
    await this.prisma.coinTopup.create({
      data: {
        userId: buyer.sub,
        coins,
        amountMinor,
        currency: 'NGN',
        provider: payment.provider,
        reference,
      },
    });
    const init = await payment.initialize({
      reference,
      amountMinor,
      currency: 'NGN',
      email: buyer.email,
      callbackUrl: `${this.webBaseUrl}/wallet/callback`,
      metadata: { kind: 'coin_topup', coins, titleName: `${coins.toLocaleString('en-NG')} coins` },
    });
    await this.audit.record({
      actorId: buyer.sub,
      action: 'coins.topup.initiated',
      entity: 'CoinTopup',
      entityId: reference,
      metadata: { coins, amountMinor },
    });
    return {
      status: 'pending' as const,
      reference,
      coins,
      amountMinor,
      authorizationUrl: init.authorizationUrl,
    };
  }

  /** Called from the callback page. Only the buyer can verify their own top-up. */
  async verifyTopup(userId: string, reference: string) {
    const topup = await this.prisma.coinTopup.findUnique({ where: { reference } });
    if (!topup || topup.userId !== userId) throw new NotFoundException('Top-up not found');
    if (this.config.get<string>('env') === 'production' && topup.provider === 'MOCK') throw new BadRequestException('Mock payments cannot credit live wallets');
    if (topup.status === 'PAID') return this.topupResult(topup, 'paid');
    if (topup.provider === 'APPLE_IAP' || topup.provider === 'GOOGLE_PLAY') {
      throw new BadRequestException('Store purchases require store verification');
    }

    const result = await this.gateway(topup.provider).verify(reference);
    if (result.status === 'paid') {
      this.reconcile(topup, result.amountMinor, result.currency);
      await this.creditTopup(topup);
      return this.topupResult(topup, 'paid');
    }
    if (result.status === 'failed') {
      await this.prisma.coinTopup.updateMany({
        where: { id: topup.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
      return this.topupResult(topup, 'failed');
    }
    return this.topupResult(topup, 'pending');
  }

  /** Paystack charge.success for a `coin_` reference (signature already verified). */
  async settleTopupFromWebhook(reference: string, amountMinor?: number, currency?: string, provider = this.payment.provider) {
    const topup = await this.prisma.coinTopup.findUnique({ where: { reference } });
    if (
      !topup ||
      topup.status === 'PAID' ||
      topup.provider === 'APPLE_IAP' ||
      topup.provider === 'GOOGLE_PLAY'
    )
      return;
    if (topup.provider === 'MOCK' || topup.provider !== provider) return;
    this.reconcile(topup, amountMinor, currency);
    await this.creditTopup(topup);
  }

  async webhook(provider: string, raw: string, signature: string | undefined) {
    const driver = this.gateway(provider);
    if (!driver.verifyWebhookSignature(raw, signature)) throw new UnauthorizedException('Invalid webhook signature');
    let event: { event?: string; data?: { reference?: string } };
    try { event = JSON.parse(raw); } catch { throw new BadRequestException('Malformed webhook payload'); }
    const reference = event.data?.reference;
    if (event.event !== 'charge.success' || typeof reference !== 'string' || !reference.startsWith(TOPUP_REF_PREFIX)) return { received: true };
    const topup = await this.prisma.coinTopup.findUnique({ where: { reference } });
    if (!topup || topup.provider !== provider || topup.status === 'PAID') return { received: true };
    // Confirm amount, currency, reference and live environment with the originating provider.
    await this.verifyTopup(topup.userId, reference);
    return { received: true };
  }

  // ── Transfers (user → user) ─────────────────────────────────────────────

  async transfer(
    sender: CoinBuyer,
    input: { recipientEmail: string; coins: number; idempotencyKey: string; note?: string },
  ) {
    assertCoins(input.coins, 1, COIN_LIMITS.transferMax, 'Transfer');
    const email = input.recipientEmail.trim().toLowerCase();
    if (email === sender.email.toLowerCase()) {
      throw new BadRequestException('You cannot send coins to yourself');
    }
    const recipient = await this.users.findByEmail(email);
    if (!recipient || recipient.deletedAt || recipient.status !== 'ACTIVE') {
      throw new BadRequestException('Recipient must have an active CinneTemple account');
    }

    const key = `transfer:${sender.sub}:${input.idempotencyKey}`;
    const replay = await this.prisma.coinLedgerEntry.findUnique({
      where: { idempotencyKey: `${key}:out` },
    });
    if (replay) {
      return {
        status: 'sent' as const,
        coins: -replay.delta,
        balance: replay.balanceAfter,
        recipient: displayName(recipient),
      };
    }

    const note = input.note?.trim().slice(0, 140) || undefined;
    const out: LedgerWrite = {
      userId: sender.sub,
      kind: 'TRANSFER_OUT',
      delta: -input.coins,
      idempotencyKey: `${key}:out`,
      counterpartyUserId: recipient.id,
      note,
    };
    const inn: LedgerWrite = {
      userId: recipient.id,
      kind: 'TRANSFER_IN',
      delta: input.coins,
      idempotencyKey: `${key}:in`,
      counterpartyUserId: sender.sub,
      note,
    };
    // Touch the two wallets in ascending id order (deadlock-free); a failed
    // debit rolls the credit back with it.
    const ordered = sender.sub < recipient.id ? [out, inn] : [inn, out];
    let balance: number;
    try {
      balance = await this.prisma.$transaction(async (tx) => {
        let senderBalance = 0;
        for (const w of ordered) {
          const b = await this.apply(tx, w);
          if (w.userId === sender.sub) senderBalance = b;
        }
        return senderBalance;
      });
    } catch (e) {
      // A double-submit with the same key raced past the replay check: it already sent.
      if (!isUniqueViolation(e)) throw e;
      const first = await this.prisma.coinLedgerEntry.findUniqueOrThrow({
        where: { idempotencyKey: `${key}:out` },
      });
      return {
        status: 'sent' as const,
        coins: -first.delta,
        balance: first.balanceAfter,
        recipient: displayName(recipient),
      };
    }

    await this.audit.record({
      actorId: sender.sub,
      action: 'coins.transfer',
      entity: 'User',
      entityId: recipient.id,
      metadata: { coins: input.coins },
    });
    await this.events.publish({
      name: 'coins.transferred',
      detail: { fromUserId: sender.sub, toUserId: recipient.id, coins: input.coins },
    });
    return {
      status: 'sent' as const,
      coins: input.coins,
      balance,
      recipient: displayName(recipient),
    };
  }

  // ── internals ───────────────────────────────────────────────────────────

  /** PENDING/FAILED → PAID exactly once, then credit. Verify and webhook may race. */
  private async creditTopup(topup: CoinTopup) {
    const credited = await this.prisma.$transaction(async (tx) => {
      const flip = await tx.coinTopup.updateMany({
        where: { id: topup.id, status: { in: ['PENDING', 'FAILED'] } },
        data: { status: 'PAID', paidAt: new Date() },
      });
      if (flip.count === 0) return false;
      await this.apply(tx, {
        userId: topup.userId,
        kind: 'TOPUP',
        delta: topup.coins,
        idempotencyKey: `topup:${topup.reference}`,
      });
      return true;
    });
    if (!credited) return;
    await this.events.publish({
      name: 'coins.topup.paid',
      detail: { userId: topup.userId, coins: topup.coins, amountMinor: topup.amountMinor },
    });
    this.logger.log(`Top-up ${topup.reference} paid → +${topup.coins} coins`);
  }

  /** A provider-reported settlement must match what we asked for, or nothing is credited. */
  private reconcile(topup: CoinTopup, amountMinor?: number, currency?: string) {
    const amountOk = (topup.provider === 'MOCK' && amountMinor === undefined) || amountMinor === topup.amountMinor;
    const currencyOk = (topup.provider === 'MOCK' && currency === undefined) || currency?.toUpperCase() === topup.currency;
    if (!amountOk || !currencyOk) {
      this.logger.error(
        `Top-up reconciliation mismatch ${topup.reference}: provider ${amountMinor ?? '—'} ` +
          `${currency ?? '—'}, expected ${topup.amountMinor} ${topup.currency}`,
      );
      throw new BadRequestException('Payment amount/currency mismatch');
    }
  }

  private async topupResult(topup: CoinTopup, status: 'paid' | 'failed' | 'pending') {
    const wallet = await this.prisma.coinWallet.findUnique({ where: { userId: topup.userId } });
    return { status, coins: topup.coins, balance: (wallet?.balance ?? 0) - (wallet?.refundDebt ?? 0) };
  }
}

export function assertCoins(coins: number, min: number, max: number, what: string) {
  if (!Number.isSafeInteger(coins) || coins < min || coins > max) {
    throw new BadRequestException(
      `${what} must be a whole number of coins between ${min.toLocaleString('en-NG')} and ${max.toLocaleString('en-NG')}`,
    );
  }
}

function displayName(u: { email: string; profile: { displayName: string } | null }) {
  return u.profile?.displayName ?? u.email.split('@')[0];
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}
