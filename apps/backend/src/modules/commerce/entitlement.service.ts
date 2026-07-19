import { ForbiddenException, Injectable } from '@nestjs/common';
import { Entitlement } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * PAY-ONCE, WATCH-ONCE contract (authoritative product rule).
 *
 * CinneTemple sells a single viewing, never a subscription. A purchase grants
 * one ACTIVE entitlement per (user, title). That entitlement opens ONE viewing
 * window on first play — runtime + 30-min pause grace, floored to MIN_WINDOW —
 * so the viewer can pause/seek/resume within a single sitting. But the film may
 * be watched only ONCE: access ends the instant EITHER happens:
 *   • COMPLETION  — the viewer reaches ~95% of the runtime → status CONSUMED
 *                   (see PlaybackService.saveProgress → EntitlementService.consume), or
 *   • WINDOW EXPIRY — the single sitting's window elapses → status EXPIRED.
 * A CONSUMED or EXPIRED entitlement can never be reopened. findUsable only ever
 * returns ACTIVE-and-in-window rows, so re-watching requires a fresh purchase.
 */

/** Grace added to the movie runtime so a viewer can pause without losing access.
 *  Exported so per-episode windows (PlaybackService) mirror the movie window. */
export const PAUSE_GRACE_SECONDS = 30 * 60;

/**
 * Floor for the viewing window when a title has no known runtime (admin-created
 * titles without durationSeconds/runtimeMinutes). Without it the window would be
 * just the 30-minute grace, locking buyers out mid-film. Exported so
 * per-episode windows (PlaybackService) mirror the movie window.
 */
export const MIN_WINDOW_SECONDS = 3 * 60 * 60;

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create the right to watch once (window opens on first play). */
  grant(userId: string, titleId: string, purchaseId: string): Promise<Entitlement> {
    return this.prisma.entitlement.create({
      data: { userId, titleId, purchaseId, status: 'ACTIVE' },
    });
  }

  /** An entitlement the user can still use: not started, or within its window. */
  async findUsable(userId: string, titleId: string): Promise<Entitlement | null> {
    const ents = await this.prisma.entitlement.findMany({
      where: { userId, titleId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
    const now = Date.now();
    for (const e of ents) {
      if (!e.expiresAt || e.expiresAt.getTime() > now) return e;
    }
    return null;
  }

  async hasUsable(userId: string, titleId: string): Promise<boolean> {
    return (await this.findUsable(userId, titleId)) !== null;
  }

  /**
   * End the single viewing by marking the user's ACTIVE entitlement for a title
   * as CONSUMED (the film was watched to completion). Idempotent: a no-op when
   * nothing is ACTIVE, so replayed completion heartbeats never throw and never
   * reopen access. Once consumed the title is unwatchable until re-purchased —
   * findUsable filters on status='ACTIVE' and will return null.
   */
  async consume(userId: string, titleId: string): Promise<void> {
    await this.prisma.entitlement.updateMany({
      where: { userId, titleId, status: 'ACTIVE' },
      data: { status: 'CONSUMED' },
    });
  }

  /**
   * Open (or resume) the single viewing window. First call stamps `startedAt` and
   * sets `expiresAt = now + runtime + grace`. Subsequent calls within the window
   * return the same entitlement; once expired it cannot be reopened.
   */
  async startViewing(
    userId: string,
    titleId: string,
    durationSeconds: number,
  ): Promise<Entitlement> {
    const ent = await this.findUsable(userId, titleId);
    if (!ent) {
      throw new ForbiddenException('No active access to this title. Purchase to watch.');
    }
    if (ent.startedAt) return ent; // already within the window
    const base = durationSeconds || 0;
    const window =
      base > 0 ? base + PAUSE_GRACE_SECONDS : Math.max(PAUSE_GRACE_SECONDS, MIN_WINDOW_SECONDS);
    const now = new Date();
    return this.prisma.entitlement.update({
      where: { id: ent.id },
      data: { startedAt: now, expiresAt: new Date(now.getTime() + window * 1000) },
    });
  }

  /** All of a user's entitlements with freshly reconciled expiry status. */
  async listForUser(userId: string): Promise<Entitlement[]> {
    const ents = await this.prisma.entitlement.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const now = Date.now();
    const expiredIds = ents
      .filter((e) => e.status === 'ACTIVE' && e.expiresAt && e.expiresAt.getTime() <= now)
      .map((e) => e.id);
    if (expiredIds.length) {
      await this.prisma.entitlement.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'EXPIRED' },
      });
    }
    return ents.map((e) => (expiredIds.includes(e.id) ? { ...e, status: 'EXPIRED' as const } : e));
  }
}
