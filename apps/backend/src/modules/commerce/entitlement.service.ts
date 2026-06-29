import { ForbiddenException, Injectable } from '@nestjs/common';
import { Entitlement } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Grace added to the movie runtime so a viewer can pause without losing access. */
const PAUSE_GRACE_SECONDS = 30 * 60;

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
    const window = (durationSeconds || 0) + PAUSE_GRACE_SECONDS;
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
    return ents.map((e) =>
      expiredIds.includes(e.id) ? { ...e, status: 'EXPIRED' as const } : e,
    );
  }
}
