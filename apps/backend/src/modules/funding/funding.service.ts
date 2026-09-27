import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FundingPool, FundingPoolStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EventBus } from '../../infra/events/event-bus';
import { AuditService } from '../auth/audit.service';
import { COIN_LIMITS } from './domain/coins';
import { planPayout, ratio } from './domain/payout';
import { assertCoins, isUniqueViolation, WalletService } from './wallet.service';

/** Payout and cancel credit every backer in one transaction; allow for large pools. */
const BULK_TX = { timeout: 60_000, maxWait: 10_000 } as const;
const SETTLEABLE: FundingPoolStatus[] = ['OPEN', 'CLOSED'];

/**
 * Film funding pools, denominated in coins (1 coin = ₦1).
 *
 *   OPEN ──close──▶ CLOSED ──payout──▶ PAID_OUT
 *     │                │
 *     └────cancel──────┴──────────────▶ CANCELLED (everyone refunded in coins)
 *
 * Viewers fund while OPEN and may claim a refund of their stake while OPEN —
 * refunds always go back to the wallet as coins. Payout is set once: each
 * pooled coin is worth payout ÷ pool coins, and backers are credited in coins.
 *
 * Lock order: the pool row first (via a conditional UPDATE that also enforces
 * the state machine), then wallets in ascending user id.
 */
@Injectable()
export class FundingService {
  private readonly logger = new Logger(FundingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
  ) {}

  // ── Viewer ──────────────────────────────────────────────────────────────

  async listPublic() {
    const pools = await this.prisma.fundingPool.findMany({
      where: { status: { not: 'CANCELLED' } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    const backers = await this.backerCounts(pools.map((p) => p.id));
    return pools.map((p) => this.view(p, backers.get(p.id) ?? 0));
  }

  async getPublic(poolId: string, userId?: string) {
    const pool = await this.prisma.fundingPool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundException('Pool not found');
    const backers = await this.backerCounts([pool.id]);
    const mine = userId
      ? await this.prisma.poolContribution.findUnique({
          where: { poolId_userId: { poolId, userId } },
        })
      : null;
    return {
      ...this.view(pool, backers.get(pool.id) ?? 0),
      myStake: mine
        ? {
            coins: mine.coins - mine.refundedCoins,
            contributedCoins: mine.coins,
            refundedCoins: mine.refundedCoins,
            payoutCoins: mine.payoutCoins,
          }
        : null,
    };
  }

  /** Move coins from the viewer's wallet into the pool. */
  async contribute(userId: string, poolId: string, coins: number, idempotencyKey: string) {
    assertCoins(coins, 1, COIN_LIMITS.contributionMax, 'Contribution');
    const key = `fund:${poolId}:${userId}:${idempotencyKey}`;
    const replay = await this.prisma.coinLedgerEntry.findUnique({ where: { idempotencyKey: key } });
    if (replay) return this.getPublic(poolId, userId);

    try {
      await this.fundTx(userId, poolId, coins, key);
    } catch (e) {
      // Same key raced past the replay check: the first attempt already landed.
      if (isUniqueViolation(e)) return this.getPublic(poolId, userId);
      throw e;
    }

    await this.audit.record({
      actorId: userId,
      action: 'funding.contribute',
      entity: 'FundingPool',
      entityId: poolId,
      metadata: { coins },
    });
    return this.getPublic(poolId, userId);
  }

  private fundTx(userId: string, poolId: string, coins: number, key: string) {
    return this.prisma.$transaction(async (tx) => {
      // Pool first: one atomic statement enforces OPEN, the deadline and the goal cap.
      const bumped = await tx.$executeRaw`
        UPDATE "funding_pools"
           SET "total_coins" = "total_coins" + ${coins}
         WHERE "id" = ${poolId}::uuid
           AND "status" = 'OPEN'
           AND ("closes_at" IS NULL OR "closes_at" > now())
           AND ("goal_coins" IS NULL OR "total_coins" + ${coins} <= "goal_coins")`;
      if (bumped === 0) await this.explainClosed(tx, poolId, coins);

      await this.wallet.apply(tx, {
        userId,
        kind: 'POOL_FUND',
        delta: -coins,
        idempotencyKey: key,
        poolId,
      });
      await tx.poolContribution.upsert({
        where: { poolId_userId: { poolId, userId } },
        create: { poolId, userId, coins },
        update: { coins: { increment: coins } },
      });
    });
  }

  /** Refund claim: the viewer's whole remaining stake goes back to their wallet as coins. */
  async claimRefund(userId: string, poolId: string) {
    const refunded = await this.prisma.$transaction(async (tx) => {
      const stake = await tx.poolContribution.findUnique({
        where: { poolId_userId: { poolId, userId } },
      });
      const net = stake ? stake.coins - stake.refundedCoins : 0;
      if (!stake || net <= 0) throw new BadRequestException('You have no coins in this pool');

      const pool = await tx.fundingPool.updateMany({
        where: { id: poolId, status: 'OPEN' },
        data: { totalCoins: { decrement: net } },
      });
      if (pool.count === 0) {
        throw new ConflictException('Funding has closed — refunds are no longer available');
      }
      // Guard against a concurrent claim that read the same stake.
      const claimed = await tx.poolContribution.updateMany({
        where: { id: stake.id, refundedCoins: stake.refundedCoins },
        data: { refundedCoins: stake.coins },
      });
      if (claimed.count === 0) throw new ConflictException('Refund already claimed');

      await this.wallet.apply(tx, {
        userId,
        kind: 'POOL_REFUND',
        delta: net,
        idempotencyKey: `refund:${poolId}:${userId}:${stake.refundedCoins}`,
        poolId,
      });
      return net;
    });

    await this.audit.record({
      actorId: userId,
      action: 'funding.refund.claimed',
      entity: 'FundingPool',
      entityId: poolId,
      metadata: { coins: refunded },
    });
    return { refundedCoins: refunded, pool: await this.getPublic(poolId, userId) };
  }

  // ── Admin ───────────────────────────────────────────────────────────────

  async create(
    adminId: string,
    input: {
      name: string;
      description?: string;
      titleId?: string;
      goalCoins?: number;
      closesAt?: string;
    },
  ) {
    if (input.goalCoins !== undefined) {
      assertCoins(input.goalCoins, 1, COIN_LIMITS.poolMax, 'Goal');
    }
    const closesAt = input.closesAt ? new Date(input.closesAt) : null;
    if (closesAt && closesAt.getTime() <= Date.now()) {
      throw new BadRequestException('Closing date must be in the future');
    }
    const pool = await this.prisma.fundingPool.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        titleId: input.titleId ?? null,
        goalCoins: input.goalCoins ?? null,
        closesAt,
        createdById: adminId,
      },
    });
    await this.audit.record({
      actorId: adminId,
      action: 'funding.pool.created',
      entity: 'FundingPool',
      entityId: pool.id,
      metadata: { goalCoins: pool.goalCoins },
    });
    return this.view(pool, 0);
  }

  async listAdmin() {
    const pools = await this.prisma.fundingPool.findMany({ orderBy: { createdAt: 'desc' } });
    const backers = await this.backerCounts(pools.map((p) => p.id));
    return pools.map((p) => this.view(p, backers.get(p.id) ?? 0));
  }

  async close(adminId: string, poolId: string) {
    const res = await this.prisma.fundingPool.updateMany({
      where: { id: poolId, status: 'OPEN' },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    if (res.count === 0) throw new ConflictException('Only an open pool can be closed');
    await this.audit.record({
      actorId: adminId,
      action: 'funding.pool.closed',
      entity: 'FundingPool',
      entityId: poolId,
    });
    return this.getPublic(poolId);
  }

  /** What each backer would receive for a given payout — no writes. */
  async previewPayout(poolId: string, payoutCoins: number) {
    assertCoins(payoutCoins, 0, COIN_LIMITS.poolMax, 'Payout');
    const pool = await this.prisma.fundingPool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundException('Pool not found');
    const stakes = await this.stakes(this.prisma, poolId);
    return this.describePlan(pool, planPayout(stakes, payoutCoins), stakes);
  }

  /**
   * Set the payout (once). Each pooled coin is worth payoutCoins ÷ totalCoins;
   * every backer is credited their share in coins, summing exactly to the payout.
   */
  async payout(adminId: string, poolId: string, payoutCoins: number) {
    assertCoins(payoutCoins, 0, COIN_LIMITS.poolMax, 'Payout');
    const result = await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.fundingPool.updateMany({
        where: { id: poolId, status: { in: SETTLEABLE } },
        data: { status: 'PAID_OUT', payoutCoins, paidOutAt: new Date() },
      });
      if (flipped.count === 0) throw new ConflictException('This pool has already been settled');
      const pool = await tx.fundingPool.findUniqueOrThrow({ where: { id: poolId } });
      if (!pool.closedAt)
        await tx.fundingPool.update({ where: { id: poolId }, data: { closedAt: new Date() } });

      const stakes = await this.stakes(tx, poolId);
      const plan = planPayout(stakes, payoutCoins);
      if (plan.totalCoins !== pool.totalCoins) {
        // The pool counter and the stakes must agree before any money moves.
        throw new Error(
          `Pool ${poolId} out of balance: counter ${pool.totalCoins}, stakes ${plan.totalCoins}`,
        );
      }
      const byStake = new Map(stakes.map((s) => [s.id, s]));
      for (const share of [...plan.shares].sort((a, b) =>
        cmp(byStake.get(a.id)!.userId, byStake.get(b.id)!.userId),
      )) {
        const userId = byStake.get(share.id)!.userId;
        await tx.poolContribution.update({
          where: { id: share.id },
          data: { payoutCoins: share.payoutCoins },
        });
        if (share.payoutCoins > 0) {
          await this.wallet.apply(tx, {
            userId,
            kind: 'POOL_PAYOUT',
            delta: share.payoutCoins,
            idempotencyKey: `payout:${poolId}:${userId}`,
            poolId,
          });
        }
      }
      return this.describePlan(pool, plan, stakes);
    }, BULK_TX);

    await this.audit.record({
      actorId: adminId,
      action: 'funding.pool.paid_out',
      entity: 'FundingPool',
      entityId: poolId,
      metadata: { payoutCoins, totalCoins: result.totalCoins, nairaPerCoin: result.nairaPerCoin },
    });
    await this.events.publish({
      name: 'funding.pool.paid_out',
      detail: {
        poolId,
        payoutCoins,
        totalCoins: result.totalCoins,
        nairaPerCoin: result.nairaPerCoin,
      },
    });
    this.logger.log(`Pool ${poolId} paid out ${payoutCoins} coins at ₦${result.nairaPerCoin}/coin`);
    return result;
  }

  /** Cancel a pool: every backer's remaining stake returns to their wallet as coins. */
  async cancel(adminId: string, poolId: string) {
    const refunded = await this.prisma.$transaction(async (tx) => {
      const flipped = await tx.fundingPool.updateMany({
        where: { id: poolId, status: { in: SETTLEABLE } },
        data: { status: 'CANCELLED', totalCoins: 0, closedAt: new Date() },
      });
      if (flipped.count === 0) throw new ConflictException('This pool has already been settled');
      const stakes = await this.stakes(tx, poolId);
      let total = 0;
      for (const s of [...stakes].sort((a, b) => cmp(a.userId, b.userId))) {
        if (s.coins <= 0) continue;
        await tx.poolContribution.update({
          where: { id: s.id },
          data: { refundedCoins: { increment: s.coins } },
        });
        await this.wallet.apply(tx, {
          userId: s.userId,
          kind: 'POOL_REFUND',
          delta: s.coins,
          idempotencyKey: `cancel:${poolId}:${s.userId}`,
          poolId,
          note: 'Pool cancelled',
        });
        total += s.coins;
      }
      return { backers: stakes.filter((s) => s.coins > 0).length, coins: total };
    }, BULK_TX);

    await this.audit.record({
      actorId: adminId,
      action: 'funding.pool.cancelled',
      entity: 'FundingPool',
      entityId: poolId,
      metadata: refunded,
    });
    return {
      refundedBackers: refunded.backers,
      refundedCoins: refunded.coins,
      pool: await this.getPublic(poolId),
    };
  }

  // ── internals ───────────────────────────────────────────────────────────

  private async stakes(db: Prisma.TransactionClient | PrismaService, poolId: string) {
    const rows = await db.poolContribution.findMany({
      where: { poolId },
      include: { user: { select: { email: true, profile: { select: { displayName: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.user.profile?.displayName ?? r.user.email.split('@')[0] ?? 'Backer',
      coins: r.coins - r.refundedCoins,
    }));
  }

  private describePlan(
    pool: FundingPool,
    plan: ReturnType<typeof planPayout>,
    stakes: { id: string; userId: string; name: string }[],
  ) {
    const who = new Map(stakes.map((s) => [s.id, s]));
    return {
      poolId: pool.id,
      totalCoins: plan.totalCoins,
      payoutCoins: plan.payoutCoins,
      nairaPerCoin: plan.nairaPerCoin,
      backers: plan.shares.map((s) => ({
        userId: who.get(s.id)!.userId,
        name: who.get(s.id)!.name,
        coins: s.coins,
        payoutCoins: s.payoutCoins,
      })),
    };
  }

  /** Turn a failed conditional UPDATE into the specific reason. */
  private async explainClosed(
    tx: Prisma.TransactionClient,
    poolId: string,
    coins: number,
  ): Promise<never> {
    const pool = await tx.fundingPool.findUnique({ where: { id: poolId } });
    if (!pool) throw new NotFoundException('Pool not found');
    if (pool.status !== 'OPEN' || (pool.closesAt && pool.closesAt <= new Date())) {
      throw new ConflictException('This pool is no longer accepting coins');
    }
    const room = (pool.goalCoins ?? 0) - pool.totalCoins;
    throw new BadRequestException(
      room > 0
        ? `Only ${room.toLocaleString('en-NG')} coins left before this pool hits its goal`
        : `This pool has reached its goal (tried to add ${coins.toLocaleString('en-NG')})`,
    );
  }

  /** Backers with a live stake (fully refunded backers don't count). */
  private async backerCounts(poolIds: string[]) {
    if (poolIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.$queryRaw<{ pool_id: string; n: bigint }[]>`
      SELECT "pool_id", COUNT(*) AS n
        FROM "pool_contributions"
       WHERE "pool_id" IN (${Prisma.join(poolIds.map((id) => Prisma.sql`${id}::uuid`))})
         AND "coins" > "refunded_coins"
       GROUP BY "pool_id"`;
    return new Map(rows.map((r) => [r.pool_id, Number(r.n)]));
  }

  private view(p: FundingPool, backers: number) {
    return {
      id: p.id,
      titleId: p.titleId,
      name: p.name,
      description: p.description,
      status: p.status,
      goalCoins: p.goalCoins,
      totalCoins: p.totalCoins,
      backers,
      payoutCoins: p.payoutCoins,
      nairaPerCoin:
        p.status === 'PAID_OUT' && p.payoutCoins !== null && p.totalCoins > 0
          ? ratio(BigInt(p.payoutCoins), BigInt(p.totalCoins))
          : null,
      closesAt: p.closesAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      paidOutAt: p.paidOutAt?.toISOString() ?? null,
    };
  }
}

function cmp(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
