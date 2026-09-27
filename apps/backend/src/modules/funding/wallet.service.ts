import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoinLedgerKind, CoinTopup, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EventBus } from '../../infra/events/event-bus';
import { AuditService } from '../auth/audit.service';
import { UsersRepository } from '../users/users.repository';
import { PAYMENT_DRIVER, type PaymentDriver } from '../commerce/domain/payment.driver';
import { COIN_LIMITS, KOBO_PER_COIN } from './domain/coins';

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
    config: ConfigService,
  ) {
    this.webBaseUrl = config.get<string>('webBaseUrl') ?? 'https://cinnetemple.com';
  }

  // ── Ledger primitive ────────────────────────────────────────────────────

  /**
   * Apply one signed movement to a wallet inside `tx`. Debits are conditional
   * (`balance >= amount`) so two concurrent spends can never overdraw; the DB
   * CHECK (balance >= 0) is the backstop. Returns the new balance.
   */
  async apply(tx: Tx, w: LedgerWrite): Promise<number> {
    if (!Number.isSafeInteger(w.delta) || w.delta === 0) {
      throw new Error(`Invalid ledger delta ${w.delta}`);
    }
    let balance: number;
    if (w.delta > 0) {
      const wallet = await tx.coinWallet.upsert({
        where: { userId: w.userId },
        create: { userId: w.userId, balance: w.delta },
        update: { balance: { increment: w.delta } },
      });
      balance = wallet.balance;
    } else {
      const amount = -w.delta;
      const res = await tx.coinWallet.updateMany({
        where: { userId: w.userId, balance: { gte: amount } },
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
      balance: wallet?.balance ?? 0,
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

  // ── Top-ups (naira → coins via Paystack) ────────────────────────────────

  async startTopup(buyer: CoinBuyer, coins: number) {
    assertCoins(coins, COIN_LIMITS.topupMin, COIN_LIMITS.topupMax, 'Top-up');
    const reference = `${TOPUP_REF_PREFIX}${randomUUID().replace(/-/g, '')}`;
    const amountMinor = coins * KOBO_PER_COIN;
    await this.prisma.coinTopup.create({
      data: {
        userId: buyer.sub,
        coins,
        amountMinor,
        currency: 'NGN',
        provider: this.payment.provider,
        reference,
      },
    });
    const init = await this.payment.initialize({
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
    if (topup.status === 'PAID') return this.topupResult(topup, 'paid');

    const result = await this.payment.verify(reference);
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
  async settleTopupFromWebhook(reference: string, amountMinor?: number, currency?: string) {
    const topup = await this.prisma.coinTopup.findUnique({ where: { reference } });
    if (!topup || topup.status === 'PAID') return;
    this.reconcile(topup, amountMinor, currency);
    await this.creditTopup(topup);
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
    const amountOk = amountMinor === undefined || amountMinor === topup.amountMinor;
    const currencyOk = currency === undefined || currency.toUpperCase() === topup.currency;
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
    return { status, coins: topup.coins, balance: wallet?.balance ?? 0 };
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
