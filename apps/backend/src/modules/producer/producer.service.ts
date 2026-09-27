import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Producer, ProducerWithdrawal, ProducerWithdrawalStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../auth/audit.service';
import { MailService } from '../auth/mail.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { availableMinor, producerShare } from './domain/earnings';

/** Default producer share of net ticket revenue: 90%. */
export const DEFAULT_SHARE_BPS = 9_000;
/** Smallest withdrawal: ₦1,000. */
export const MIN_WITHDRAWAL_MINOR = 100_000;
const CODE_TTL_MS = 10 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
/** Statuses whose amount is no longer available to withdraw. */
const LOCKED: ProducerWithdrawalStatus[] = ['REQUESTED', 'PAID'];
const DAILY_WINDOW_DAYS = 30;

export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/**
 * Producers: link a film to its producer by email, send them a private
 * dashboard link, report views + earnings, and run naira withdrawals.
 *
 * Earnings = Σ producerShare(sale) over PAID ticket purchases of their films
 * (see domain/earnings.ts). Available = earnings − REQUESTED − PAID −
 * unexpired AWAITING_CONFIRMATION withdrawals. Requests are serialised per
 * producer with a row lock so two tabs can't overdraw.
 */
@Injectable()
export class ProducerService {
  private readonly logger = new Logger(ProducerService.name);
  private readonly webBaseUrl: string;
  private readonly appleCommissionBps: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.webBaseUrl = (config.get<string>('webBaseUrl') ?? 'https://cinnetemple.com').replace(
      /\/$/,
      '',
    );
    this.appleCommissionBps = config.get<number>('appleCommissionBps') ?? 3_000;
  }

  // ── Admin: assign a producer + send the link ────────────────────────────

  async forTitle(titleId: string) {
    const link = await this.prisma.producerTitle.findUnique({
      where: { titleId },
      include: { producer: true },
    });
    if (!link) return null;
    return {
      email: link.producer.email,
      name: link.producer.name,
      revenueShareBps: link.revenueShareBps,
      linkSentAt: link.producer.keyIssuedAt.toISOString(),
      lastSeenAt: link.producer.lastSeenAt?.toISOString() ?? null,
    };
  }

  /**
   * Attach (or re-attach) a film to a producer by email and email them a fresh
   * dashboard link. Sending a link rotates the producer's key: any earlier link
   * stops working, which also doubles as "revoke a leaked link".
   */
  async assign(
    adminId: string,
    titleId: string,
    input: { email: string; name?: string; revenueShareBps?: number },
  ) {
    const title = await this.catalogue.findRaw(titleId);
    if (!title) throw new NotFoundException('Title not found');
    const email = input.email.trim().toLowerCase();
    const shareBps = input.revenueShareBps ?? DEFAULT_SHARE_BPS;
    const key = newKey();

    const producer = await this.prisma.$transaction(async (tx) => {
      const p = await tx.producer.upsert({
        where: { email },
        create: {
          email,
          name: input.name?.trim() || null,
          keyHash: sha256(key),
          keyIssuedAt: new Date(),
        },
        update: {
          keyHash: sha256(key),
          keyIssuedAt: new Date(),
          ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        },
      });
      await tx.producerTitle.upsert({
        where: { titleId },
        create: { titleId, producerId: p.id, revenueShareBps: shareBps },
        update: { producerId: p.id, revenueShareBps: shareBps },
      });
      return p;
    });

    await this.sendLink(producer, key, title.title);
    await this.audit.record({
      actorId: adminId,
      action: 'producer.assigned',
      entity: 'Title',
      entityId: titleId,
      metadata: { producerId: producer.id, revenueShareBps: shareBps },
    });
    return this.forTitle(titleId);
  }

  /** Re-send (and rotate) the link for the producer already on a title. */
  async resendLink(adminId: string, titleId: string) {
    const link = await this.prisma.producerTitle.findUnique({
      where: { titleId },
      include: { producer: true },
    });
    if (!link) throw new NotFoundException('No producer on this title yet');
    const title = await this.catalogue.findRaw(titleId);
    const key = newKey();
    const producer = await this.prisma.producer.update({
      where: { id: link.producerId },
      data: { keyHash: sha256(key), keyIssuedAt: new Date() },
    });
    await this.sendLink(producer, key, title?.title ?? 'your film');
    await this.audit.record({
      actorId: adminId,
      action: 'producer.link.resent',
      entity: 'Title',
      entityId: titleId,
      metadata: { producerId: producer.id },
    });
    return this.forTitle(titleId);
  }

  // ── Producer: auth by link key ──────────────────────────────────────────

  async authenticate(key: string | undefined): Promise<Producer | null> {
    if (!key || key.length < 32 || key.length > 128) return null;
    const producer = await this.prisma.producer.findUnique({ where: { keyHash: sha256(key) } });
    if (producer && (!producer.lastSeenAt || Date.now() - producer.lastSeenAt.getTime() > 60_000)) {
      await this.prisma.producer.update({
        where: { id: producer.id },
        data: { lastSeenAt: new Date() },
      });
    }
    return producer;
  }

  // ── Producer: dashboard ─────────────────────────────────────────────────

  async dashboard(producer: Producer) {
    const links = await this.prisma.producerTitle.findMany({
      where: { producerId: producer.id },
      orderBy: { assignedAt: 'asc' },
    });
    const titleIds = links.map((l) => l.titleId);
    const shareOf = new Map(links.map((l) => [l.titleId, l.revenueShareBps]));

    const [sales, movieViews, episodeViews, finished, daily, withdrawals] = await Promise.all([
      titleIds.length
        ? this.prisma.purchase.findMany({
            where: { titleId: { in: titleIds }, status: 'PAID' },
            select: { titleId: true, amountMinor: true, provider: true },
          })
        : [],
      titleIds.length
        ? this.prisma.entitlement.groupBy({
            by: ['titleId'],
            where: { titleId: { in: titleIds }, startedAt: { not: null } },
            _count: { _all: true },
          })
        : [],
      titleIds.length
        ? this.prisma.episodePlayback.groupBy({
            by: ['titleId'],
            where: { titleId: { in: titleIds }, startedAt: { not: null } },
            _count: { _all: true },
          })
        : [],
      titleIds.length
        ? this.prisma.entitlement.groupBy({
            by: ['titleId'],
            where: { titleId: { in: titleIds }, status: 'CONSUMED' },
            _count: { _all: true },
          })
        : [],
      this.dailyViews(titleIds),
      this.prisma.producerWithdrawal.findMany({
        where: { producerId: producer.id, status: { not: 'EXPIRED' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const count = (rows: { titleId: string; _count: { _all: number } }[]) =>
      new Map(rows.map((r) => [r.titleId, r._count._all]));
    const mv = count(movieViews);
    const ev = count(episodeViews);
    const fin = count(finished);

    const films = await Promise.all(
      links.map(async (l) => {
        const summary = await this.catalogue.summaryFor(l.titleId);
        const own = sales.filter((s) => s.titleId === l.titleId);
        const share = shareOf.get(l.titleId) ?? DEFAULT_SHARE_BPS;
        return {
          titleId: l.titleId,
          title: summary?.title ?? 'Untitled',
          type: summary?.type ?? 'movie',
          year: summary?.year ?? null,
          posterUrl: summary?.posterUrl ?? null,
          revenueShareBps: share,
          views: (mv.get(l.titleId) ?? 0) + (ev.get(l.titleId) ?? 0),
          completedViews: fin.get(l.titleId) ?? 0,
          ticketsSold: own.length,
          grossMinor: own.reduce((sum, s) => sum + s.amountMinor, 0),
          earningsMinor: own.reduce(
            (sum, s) => sum + producerShare(s, share, this.appleCommissionBps),
            0,
          ),
        };
      }),
    );

    const earned = films.reduce((sum, f) => sum + f.earningsMinor, 0);
    const now = Date.now();
    const pending = withdrawals.filter(
      (w) =>
        w.status === 'AWAITING_CONFIRMATION' && w.codeExpiresAt && w.codeExpiresAt.getTime() > now,
    );
    const sumOf = (ws: ProducerWithdrawal[]) => ws.reduce((s, w) => s + w.amountMinor, 0);
    const requested = sumOf(withdrawals.filter((w) => w.status === 'REQUESTED'));
    const paid = sumOf(withdrawals.filter((w) => w.status === 'PAID'));
    const lastBank = withdrawals.find((w) => w.status !== 'AWAITING_CONFIRMATION');

    return {
      producer: { name: producer.name, email: producer.email },
      totals: {
        views: films.reduce((s, f) => s + f.views, 0),
        completedViews: films.reduce((s, f) => s + f.completedViews, 0),
        ticketsSold: films.reduce((s, f) => s + f.ticketsSold, 0),
        grossMinor: films.reduce((s, f) => s + f.grossMinor, 0),
        earningsMinor: earned,
      },
      balance: {
        earnedMinor: earned,
        requestedMinor: requested,
        paidMinor: paid,
        availableMinor: availableMinor(earned, requested + paid + sumOf(pending)),
        minWithdrawalMinor: MIN_WITHDRAWAL_MINOR,
      },
      dailyViews: daily,
      films,
      lastBank: lastBank
        ? {
            bankName: lastBank.bankName,
            accountNumber: lastBank.accountNumber,
            accountName: lastBank.accountName,
          }
        : null,
      withdrawals: withdrawals
        .filter((w) => w.status !== 'AWAITING_CONFIRMATION')
        .map((w) => this.withdrawalView(w)),
      currency: 'NGN',
    };
  }

  // ── Producer: withdrawals ───────────────────────────────────────────────

  /**
   * Step 1: reserve the amount and email a 6-digit code. The producer row is
   * locked for the duration so concurrent requests see each other's holds.
   */
  async requestWithdrawal(
    producer: Producer,
    input: { amountNaira: number; bankName: string; accountNumber: string; accountName: string },
  ) {
    const amountMinor = input.amountNaira * 100;
    if (!Number.isSafeInteger(amountMinor) || amountMinor < MIN_WITHDRAWAL_MINOR) {
      throw new BadRequestException('The minimum withdrawal is ₦1,000');
    }
    if (!/^\d{10}$/.test(input.accountNumber)) {
      throw new BadRequestException('Account number must be 10 digits (NUBAN)');
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "producers" WHERE id = ${producer.id}::uuid FOR UPDATE`;
      await tx.producerWithdrawal.updateMany({
        where: {
          producerId: producer.id,
          status: 'AWAITING_CONFIRMATION',
          codeExpiresAt: { lte: new Date() },
        },
        data: { status: 'EXPIRED', codeHash: null },
      });
      const available = await this.availableInTx(tx, producer.id);
      if (amountMinor > available) {
        throw new BadRequestException(
          `You can withdraw up to ₦${Math.floor(available / 100).toLocaleString('en-NG')} right now`,
        );
      }
      const created = await tx.producerWithdrawal.create({
        data: {
          producerId: producer.id,
          amountMinor,
          bankName: input.bankName.trim(),
          accountNumber: input.accountNumber,
          accountName: input.accountName.trim(),
          codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      });
      return tx.producerWithdrawal.update({
        where: { id: created.id },
        data: { codeHash: sha256(`${created.id}:${code}`) },
      });
    });

    await this.mail.sendPlain(
      producer.email,
      `Your CinneTemple withdrawal code: ${code}`,
      [
        `Your code to confirm a withdrawal of ${naira(amountMinor)} to ${withdrawal.accountName}, ` +
          `${withdrawal.bankName} ${mask(withdrawal.accountNumber)} is:`,
        '',
        `    ${code}`,
        '',
        'It expires in 10 minutes. If you did not request this, ignore this email and ask ' +
          'CinneTemple to send you a new dashboard link.',
      ].join('\n'),
    );
    return { id: withdrawal.id, expiresAt: withdrawal.codeExpiresAt!.toISOString() };
  }

  /** Step 2: the emailed code moves the request into the admin payout queue. */
  async confirmWithdrawal(producer: Producer, id: string, code: string) {
    const w = await this.prisma.producerWithdrawal.findFirst({
      where: { id, producerId: producer.id },
    });
    if (!w || w.status !== 'AWAITING_CONFIRMATION' || !w.codeHash) {
      throw new NotFoundException('This withdrawal is no longer waiting for a code');
    }
    if (!w.codeExpiresAt || w.codeExpiresAt.getTime() <= Date.now()) {
      await this.prisma.producerWithdrawal.updateMany({
        where: { id, status: 'AWAITING_CONFIRMATION' },
        data: { status: 'EXPIRED', codeHash: null },
      });
      throw new BadRequestException('That code has expired — start the withdrawal again');
    }
    if (w.codeAttempts >= MAX_CODE_ATTEMPTS) {
      throw new BadRequestException('Too many wrong codes — start the withdrawal again');
    }
    const ok = safeEqual(sha256(`${w.id}:${code.trim()}`), w.codeHash);
    if (!ok) {
      const attempts = w.codeAttempts + 1;
      await this.prisma.producerWithdrawal.update({
        where: { id },
        data:
          attempts >= MAX_CODE_ATTEMPTS
            ? { codeAttempts: attempts, status: 'EXPIRED', codeHash: null }
            : { codeAttempts: attempts },
      });
      throw new BadRequestException(
        attempts >= MAX_CODE_ATTEMPTS
          ? 'Too many wrong codes — start the withdrawal again'
          : `Wrong code — ${MAX_CODE_ATTEMPTS - attempts} tries left`,
      );
    }
    const res = await this.prisma.producerWithdrawal.updateMany({
      where: { id, status: 'AWAITING_CONFIRMATION' },
      data: { status: 'REQUESTED', requestedAt: new Date(), codeHash: null },
    });
    if (res.count === 0) throw new ConflictException('Already confirmed');
    this.logger.log(`Producer ${producer.id} requested withdrawal ${id}`);
    return this.dashboard(producer);
  }

  // ── Admin: payout queue ─────────────────────────────────────────────────

  async listWithdrawals(status?: ProducerWithdrawalStatus) {
    const rows = await this.prisma.producerWithdrawal.findMany({
      where: status ? { status } : { status: { in: ['REQUESTED', 'PAID', 'REJECTED'] } },
      include: { producer: { select: { email: true, name: true } } },
      orderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((w) => ({
      ...this.withdrawalView(w),
      producerEmail: w.producer.email,
      producerName: w.producer.name,
    }));
  }

  async markPaid(adminId: string, id: string, transferRef: string) {
    const w = await this.review(adminId, id, 'PAID', { transferRef: transferRef.trim() });
    await this.mail.sendPlain(
      w.producerEmail,
      `Your CinneTemple withdrawal of ${naira(w.amountMinor)} has been paid`,
      `We've sent ${naira(w.amountMinor)} to ${w.accountName}, ${w.bankName} ${mask(w.accountNumber)}.\n` +
        `Transfer reference: ${w.transferRef}\n\nIt can take a few minutes to reflect in your account.`,
    );
    return w;
  }

  async reject(adminId: string, id: string, note: string) {
    const w = await this.review(adminId, id, 'REJECTED', { note: note.trim() });
    await this.mail.sendPlain(
      w.producerEmail,
      `Your CinneTemple withdrawal of ${naira(w.amountMinor)} was not processed`,
      `Reason: ${w.note}\n\nThe amount is back in your available balance. Open your dashboard ` +
        'link to request it again.',
    );
    return w;
  }

  // ── internals ───────────────────────────────────────────────────────────

  private async review(
    adminId: string,
    id: string,
    status: 'PAID' | 'REJECTED',
    data: { transferRef?: string; note?: string },
  ) {
    const res = await this.prisma.producerWithdrawal.updateMany({
      where: { id, status: 'REQUESTED' },
      data: { status, reviewedAt: new Date(), reviewedById: adminId, ...data },
    });
    if (res.count === 0) throw new ConflictException('Only a requested withdrawal can be reviewed');
    const w = await this.prisma.producerWithdrawal.findUniqueOrThrow({
      where: { id },
      include: { producer: { select: { email: true, name: true } } },
    });
    await this.audit.record({
      actorId: adminId,
      action: `producer.withdrawal.${status.toLowerCase()}`,
      entity: 'ProducerWithdrawal',
      entityId: id,
      metadata: { amountMinor: w.amountMinor, producerId: w.producerId, ...data },
    });
    return {
      ...this.withdrawalView(w),
      producerEmail: w.producer.email,
      producerName: w.producer.name,
    };
  }

  private async availableInTx(tx: Prisma.TransactionClient, producerId: string) {
    const links = await tx.producerTitle.findMany({ where: { producerId } });
    const share = new Map(links.map((l) => [l.titleId, l.revenueShareBps]));
    const sales = links.length
      ? await tx.purchase.findMany({
          where: { titleId: { in: links.map((l) => l.titleId) }, status: 'PAID' },
          select: { titleId: true, amountMinor: true, provider: true },
        })
      : [];
    const earned = sales.reduce(
      (sum, s) =>
        sum + producerShare(s, share.get(s.titleId) ?? DEFAULT_SHARE_BPS, this.appleCommissionBps),
      0,
    );
    const locked = await tx.producerWithdrawal.aggregate({
      where: {
        producerId,
        OR: [
          { status: { in: LOCKED } },
          { status: 'AWAITING_CONFIRMATION', codeExpiresAt: { gt: new Date() } },
        ],
      },
      _sum: { amountMinor: true },
    });
    return availableMinor(earned, locked._sum.amountMinor ?? 0);
  }

  /** Views per day (Lagos time) over the last 30 days, zero-filled. */
  private async dailyViews(titleIds: string[]) {
    const days: { date: string; views: number }[] = [];
    const today = lagosDate(new Date());
    for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i--) {
      days.push({ date: shiftDate(today, -i), views: 0 });
    }
    if (titleIds.length === 0) return days;
    const ids = Prisma.join(titleIds.map((id) => Prisma.sql`${id}::uuid`));
    const since = new Date(Date.now() - DAILY_WINDOW_DAYS * 86_400_000);
    const rows = await this.prisma.$queryRaw<{ day: string; n: bigint }[]>`
      SELECT to_char(started_at AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS day, COUNT(*) AS n
        FROM (
          SELECT "started_at" FROM "entitlements"
           WHERE "title_id" IN (${ids}) AND "started_at" >= ${since}
          UNION ALL
          SELECT "started_at" FROM "episode_playback"
           WHERE "title_id" IN (${ids}) AND "started_at" >= ${since}
        ) v
       GROUP BY 1`;
    const byDay = new Map(rows.map((r) => [r.day, Number(r.n)]));
    return days.map((d) => ({ ...d, views: byDay.get(d.date) ?? 0 }));
  }

  private async sendLink(producer: Producer, key: string, filmTitle: string) {
    // The key rides in the URL fragment: browsers never send it to servers,
    // proxies or Referer headers — the page reads it and sends it as a header.
    const url = `${this.webBaseUrl}/producer#key=${key}`;
    await this.mail.sendPlain(
      producer.email,
      `Your CinneTemple producer dashboard — ${filmTitle}`,
      [
        `Hello${producer.name ? ` ${producer.name}` : ''},`,
        '',
        `"${filmTitle}" is on CinneTemple. Your private dashboard shows its views and your ` +
          'earnings, and lets you withdraw to your bank account:',
        '',
        url,
        '',
        'Keep this link private — anyone with it can see your numbers. Withdrawals also need a ' +
          'code we email you. This link replaces any earlier one we sent.',
        '',
        '— CinneTemple',
      ].join('\n'),
    );
  }

  private withdrawalView(w: ProducerWithdrawal) {
    return {
      id: w.id,
      amountMinor: w.amountMinor,
      bankName: w.bankName,
      accountNumber: w.accountNumber,
      accountName: w.accountName,
      status: w.status,
      requestedAt: w.requestedAt?.toISOString() ?? null,
      reviewedAt: w.reviewedAt?.toISOString() ?? null,
      transferRef: w.transferRef,
      note: w.note,
      createdAt: w.createdAt.toISOString(),
    };
  }
}

function newKey() {
  return randomBytes(32).toString('base64url');
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function naira(minor: number) {
  return `₦${Math.floor(minor / 100).toLocaleString('en-NG')}`;
}

function mask(account: string) {
  return `••••${account.slice(-4)}`;
}

function lagosDate(d: Date) {
  // Africa/Lagos is UTC+1 year-round (no DST).
  return new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);
}

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
