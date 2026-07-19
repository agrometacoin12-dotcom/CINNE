import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Episode, EpisodePlayback } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import {
  EntitlementService,
  MIN_WINDOW_SECONDS,
  PAUSE_GRACE_SECONDS,
} from '../commerce/entitlement.service';
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

/** Playback session for one episode of a series (superset of the movie shape). */
export interface EpisodePlaybackSession extends PlaybackSession {
  episodeId: string;
  episodeName: string;
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
  async start(
    user: { sub: string; email: string },
    titleId: string,
    episodeId?: string,
  ): Promise<PlaybackSession> {
    if (episodeId) return this.startEpisode(user, titleId, episodeId);
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
  async status(user: { sub: string }, titleId: string, episodeId?: string) {
    if (episodeId) return this.episodeStatus(user, titleId, episodeId);
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
    episodeId?: string,
  ) {
    const durationSeconds = Math.floor(input.durationSeconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new BadRequestException('durationSeconds must be a positive number');
    }
    const positionSeconds = Math.min(
      Math.max(0, Math.floor(input.positionSeconds)),
      durationSeconds,
    );

    if (episodeId) {
      return this.saveEpisodeProgress(userId, titleId, episodeId, positionSeconds, durationSeconds);
    }

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

  // ── Per-episode watch-once (series) ─────────────────────────────────────────
  //
  // One ticket buys the SERIES (an entitlement on the series titleId), but each
  // episode is watchable exactly once. The movie flow's entitlement window is
  // mirrored per episode on the EpisodePlayback row: first play stamps
  // startedAt/expiresAt (runtime + pause grace, floored like movies), reaching
  // >=95% stamps consumedAt, and a consumed or window-expired episode can never
  // be streamed again. When every playable episode is consumed, the series
  // entitlement itself flips to CONSUMED.

  private episodeDuration(e: Episode): number {
    return e.durationSeconds ?? (e.runtimeMinutes ? e.runtimeMinutes * 60 : 0);
  }

  /** Look up an episode of a published series, mirroring the movie 404 style. */
  private async findPlayableEpisode(titleId: string, episodeId: string) {
    const title = await this.catalogue.findRaw(titleId);
    if (!title || title.status !== 'published') throw new NotFoundException('Title not found');
    const episode = await this.prisma.episode.findFirst({ where: { id: episodeId, titleId } });
    if (!episode) throw new NotFoundException('Episode not found');
    return { title, episode };
  }

  /** Authorize episode playback: series entitlement + per-episode watch-once. */
  private async startEpisode(
    user: { sub: string; email: string },
    titleId: string,
    episodeId: string,
  ): Promise<EpisodePlaybackSession> {
    const { title, episode } = await this.findPlayableEpisode(titleId, episodeId);
    if (!episode.videoKey) throw new NotFoundException('This episode has no video yet');

    if (title.isPremiere && !CatalogueService.premiereIsLive(title)) {
      throw new ForbiddenException(
        title.premiereStartAt
          ? `Premiere begins ${title.premiereStartAt}`
          : 'Premiere has not started',
      );
    }

    // The ticket covers the whole series: the entitlement is checked against
    // the series titleId, but its own single-sitting window is NOT opened —
    // per-episode windows live on the EpisodePlayback row instead.
    const ent = await this.entitlements.findUsable(user.sub, titleId);
    if (!ent) {
      throw new ForbiddenException('No active access to this title. Purchase to watch.');
    }

    const duration = this.episodeDuration(episode);
    const playback = await this.openEpisodeWindow(user.sub, titleId, episode, duration);

    const url = this.media.playbackUrl(episode.videoKey, user.sub);
    if (!url) throw new NotFoundException('Playback source unavailable');

    await this.audit.record({
      actorId: user.sub,
      action: 'playback.start',
      entity: 'Episode',
      entityId: episodeId,
      metadata: { titleId },
    });

    return {
      titleId,
      episodeId,
      title: title.title,
      episodeName: episode.name,
      url,
      durationSeconds: duration,
      watermark: this.watermarkFor(user, titleId),
      sessionId: ent.id,
      expiresAt: playback.expiresAt?.toISOString() ?? null,
    };
  }

  /**
   * Open (or resume) the episode's single viewing window — the per-episode
   * mirror of EntitlementService.startViewing. Refuses consumed episodes and
   * elapsed windows; both are unrecoverable, exactly like movies.
   */
  private async openEpisodeWindow(
    userId: string,
    titleId: string,
    episode: Episode,
    durationSeconds: number,
  ): Promise<EpisodePlayback> {
    const existing = await this.prisma.episodePlayback.findUnique({
      where: { userId_episodeId: { userId, episodeId: episode.id } },
    });
    if (existing?.consumedAt) {
      throw new ForbiddenException('This episode has already been watched.');
    }
    if (existing?.startedAt) {
      if (existing.expiresAt && existing.expiresAt.getTime() <= Date.now()) {
        throw new ForbiddenException('The viewing window for this episode has closed.');
      }
      return existing; // already within the window
    }
    const base = durationSeconds || 0;
    const window =
      base > 0 ? base + PAUSE_GRACE_SECONDS : Math.max(PAUSE_GRACE_SECONDS, MIN_WINDOW_SECONDS);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + window * 1000);
    return this.prisma.episodePlayback.upsert({
      where: { userId_episodeId: { userId, episodeId: episode.id } },
      create: {
        userId,
        episodeId: episode.id,
        titleId,
        durationSeconds: durationSeconds || 0,
        startedAt: now,
        expiresAt,
      },
      update: { startedAt: now, expiresAt },
    });
  }

  /** Episode access state without opening/extending the window. */
  private async episodeStatus(user: { sub: string }, titleId: string, episodeId: string) {
    const { title, episode } = await this.findPlayableEpisode(titleId, episodeId);
    const usable = await this.entitlements.findUsable(user.sub, titleId);
    const playback = await this.prisma.episodePlayback.findUnique({
      where: { userId_episodeId: { userId: user.sub, episodeId: episode.id } },
    });
    const consumed = Boolean(playback?.consumedAt);
    const windowOpen =
      !playback?.startedAt || !playback.expiresAt || playback.expiresAt.getTime() > Date.now();
    return {
      titleId,
      episodeId,
      hasAccess: usable !== null && !consumed && windowOpen,
      started: Boolean(playback?.startedAt),
      consumed,
      expiresAt: playback?.expiresAt?.toISOString() ?? null,
      premiere: title.isPremiere,
      premiereLive: CatalogueService.premiereIsLive(title),
      premiereStartAt: title.premiereStartAt,
    };
  }

  /**
   * Episode heartbeat: upsert position, stamp consumedAt at >=95%, and flip the
   * series entitlement to CONSUMED once every playable episode is consumed.
   */
  private async saveEpisodeProgress(
    userId: string,
    titleId: string,
    episodeId: string,
    positionSeconds: number,
    durationSeconds: number,
  ) {
    await this.findPlayableEpisode(titleId, episodeId);

    const saved = await this.prisma.episodePlayback.upsert({
      where: { userId_episodeId: { userId, episodeId } },
      create: { userId, episodeId, titleId, positionSeconds, durationSeconds },
      update: { positionSeconds, durationSeconds },
    });

    // Watch-once enforcement, per episode: reaching completion (>=95%) stamps
    // consumedAt so this episode can never be replayed. Idempotent — the
    // conditional updateMany is a no-op on repeated end-of-episode heartbeats.
    const progress = saved.positionSeconds / saved.durationSeconds;
    let consumed = Boolean(saved.consumedAt);
    if (progress >= COMPLETION_THRESHOLD && !consumed) {
      await this.prisma.episodePlayback.updateMany({
        where: { userId, episodeId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      consumed = true;
      await this.consumeSeriesIfFinished(userId, titleId);
    }

    return {
      titleId,
      episodeId,
      positionSeconds: saved.positionSeconds,
      durationSeconds: saved.durationSeconds,
      progress,
      consumed,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  /**
   * Pay-once/watch-once for series: when EVERY playable episode (one with a
   * video) has been consumed by this viewer, the series entitlement itself is
   * CONSUMED — the ticket is fully used and can never be reopened.
   */
  private async consumeSeriesIfFinished(userId: string, titleId: string): Promise<void> {
    const [playable, consumed] = await Promise.all([
      this.prisma.episode.count({ where: { titleId, videoKey: { not: null } } }),
      this.prisma.episodePlayback.count({
        where: { userId, titleId, consumedAt: { not: null }, episode: { videoKey: { not: null } } },
      }),
    ]);
    if (playable > 0 && consumed >= playable) {
      await this.entitlements.consume(userId, titleId);
    }
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
