import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { EntitlementService } from '../commerce/entitlement.service';
import { MediaService } from '../media/media.service';
import { AuditService } from '../auth/audit.service';

export interface PlaybackSession {
  titleId: string;
  title: string;
  url: string;
  durationSeconds: number;
  /** Per-viewer text burned into the player overlay (anti-piracy). */
  watermark: string;
  /** Opaque viewing-session id (the entitlement). */
  sessionId: string;
  /** When the single-view window closes. */
  expiresAt: string | null;
}

/** One "Continue watching" rail item. */
export interface ContinueWatchingItem {
  titleId: string;
  title: string;
  posterUrl: string | null;
  heroUrl: string | null;
  positionSeconds: number;
  durationSeconds: number;
  /** 0..1 fraction watched. */
  progress: number;
  updatedAt: string;
}

/**
 * Fraction of runtime treated as "finished the film". Shared by two rules:
 *   • reaching it CONSUMES the single-view entitlement (pay-once/watch-once), and
 *   • items beyond it drop off the Continue-watching rail.
 */
const COMPLETION_THRESHOLD = 0.95;
/** Cap the rail; the player only ever needs the most recent handful. */
const CONTINUE_WATCHING_LIMIT = 20;

@Injectable()
export class PlaybackService {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly entitlements: EntitlementService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  private durationOf(t: { durationSeconds: number | null; runtimeMinutes: number | null }): number {
    return t.durationSeconds ?? (t.runtimeMinutes ? t.runtimeMinutes * 60 : 0);
  }

  /** Authorize playback: enforce entitlement + premiere timing, open the window. */
  async start(user: { sub: string; email: string }, titleId: string): Promise<PlaybackSession> {
    const title = await this.catalogue.findRaw(titleId);
    if (!title || title.status !== 'published') throw new NotFoundException('Title not found');
    if (!title.videoKey) throw new NotFoundException('This title has no video yet');

    if (title.isPremiere && !CatalogueService.premiereIsLive(title)) {
      throw new ForbiddenException(
        title.premiereStartAt
          ? `Premiere begins ${title.premiereStartAt}`
          : 'Premiere has not started',
      );
    }

    const duration = this.durationOf(title);
    const ent = await this.entitlements.startViewing(user.sub, titleId, duration);

    // Bind the signed stream URL to the requesting viewer (CT-05): the user id
    // is folded into the URL's HMAC so a copied URL can't be replayed under a
    // different identity within its TTL.
    const url = this.media.playbackUrl(title.videoKey, user.sub);
    if (!url) throw new NotFoundException('Playback source unavailable');

    await this.audit.record({
      actorId: user.sub,
      action: 'playback.start',
      entity: 'Title',
      entityId: titleId,
    });

    return {
      titleId,
      title: title.title,
      url,
      durationSeconds: duration,
      watermark: this.watermarkFor(user, titleId),
      sessionId: ent.id,
      expiresAt: ent.expiresAt?.toISOString() ?? null,
    };
  }

  /** Current access state without opening/extending the window. */
  async status(user: { sub: string }, titleId: string) {
    const title = await this.catalogue.findRaw(titleId);
    if (!title) throw new NotFoundException('Title not found');
    const usable = await this.entitlements.findUsable(user.sub, titleId);
    return {
      titleId,
      hasAccess: usable !== null,
      started: Boolean(usable?.startedAt),
      expiresAt: usable?.expiresAt?.toISOString() ?? null,
      premiere: title.isPremiere,
      premiereLive: CatalogueService.premiereIsLive(title),
      premiereStartAt: title.premiereStartAt,
    };
  }

  // ── Resume-watching progress ────────────────────────────────────────────────

  /**
   * Player heartbeat (~every 10s): upsert the caller's position for a title.
   * Single-query upsert on unique(userId, titleId) keeps it throttle-friendly.
   * Position is clamped to [0, duration]; a non-positive duration is a 400.
   */
  async saveProgress(
    userId: string,
    titleId: string,
    input: { positionSeconds: number; durationSeconds: number },
  ) {
    const durationSeconds = Math.floor(input.durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new BadRequestException('durationSeconds must be a positive number');
    }
    const positionSeconds = Math.min(
      Math.max(0, Math.floor(input.positionSeconds)),
      durationSeconds,
    );

    const saved = await this.prisma.playbackProgress.upsert({
      where: { userId_titleId: { userId, titleId } },
      create: { userId, titleId, positionSeconds, durationSeconds },
      update: { positionSeconds, durationSeconds },
    });

    // Watch-once enforcement: reaching completion (>=95%) ends access for good —
    // consume the ACTIVE entitlement so the title can never be replayed without a
    // new purchase. Idempotent, so repeated end-of-film heartbeats are harmless.
    //
    // TODO(CT-05): this heartbeat-driven consume is defense-in-depth, not the
    // authoritative single-sitting limit. A hostile client can stream to the end
    // and never report >=95%; the server-side viewing window (runtime + grace,
    // enforced in EntitlementService) remains the real bound — it expires the
    // entitlement regardless of what the player reports. Do not treat the 95%
    // heartbeat as a cryptographic guarantee.
    const progress = saved.positionSeconds / saved.durationSeconds;
    if (progress >= COMPLETION_THRESHOLD) {
      await this.entitlements.consume(userId, titleId);
    }

    return {
      titleId,
      positionSeconds: saved.positionSeconds,
      durationSeconds: saved.durationSeconds,
      progress,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  /**
   * The caller's "Continue watching" rail, newest-updated first. Excludes items
   * that are effectively finished (>95%) and titles that no longer exist or are
   * unpublished.
   */
  async continueWatching(userId: string): Promise<ContinueWatchingItem[]> {
    const rows = await this.prisma.playbackProgress.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: CONTINUE_WATCHING_LIMIT,
    });

    const items = await Promise.all(
      rows.map(async (row) => {
        if (row.durationSeconds <= 0) return null;
        const progress = row.positionSeconds / row.durationSeconds;
        if (progress > COMPLETION_THRESHOLD) return null;

        const title = await this.catalogue.findRaw(row.titleId);
        if (!title || title.status !== 'published') return null;

        // Watch-once: only surface titles the viewer can still watch. A consumed
        // (or expired) entitlement is no longer ACTIVE, so hasUsable is false and
        // the title drops off the rail even though a progress row lingers.
        if (!(await this.entitlements.hasUsable(userId, row.titleId))) return null;

        return {
          titleId: row.titleId,
          title: title.title,
          // Images are public static assets — hand out the cacheable /media/
          // URLs (same as catalogue browse), not signed expiring stream URLs.
          posterUrl: title.posterKey ? this.media.publicUrl(title.posterKey) : null,
          heroUrl: title.heroKey ? this.media.publicUrl(title.heroKey) : null,
          positionSeconds: row.positionSeconds,
          durationSeconds: row.durationSeconds,
          progress,
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
    );

    return items.filter((i): i is ContinueWatchingItem => i !== null);
  }

  /** Remove a title from "Continue watching". Idempotent. */
  async clearProgress(userId: string, titleId: string) {
    await this.prisma.playbackProgress.deleteMany({ where: { userId, titleId } });
    return { titleId, cleared: true };
  }

  /**
   * Viewer-identifying watermark: email + a short hash of (user, title) so a
   * leaked screen recording traces back to the account, without exposing the
   * raw user id.
   */
  private watermarkFor(user: { sub: string; email: string }, titleId: string): string {
    const tag = createHash('sha256').update(`${user.sub}:${titleId}`).digest('hex').slice(0, 6);
    return `${user.email} · ${tag.toUpperCase()}`;
  }
}
