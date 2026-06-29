import { createHash } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

@Injectable()
export class PlaybackService {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly entitlements: EntitlementService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
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

    const url = this.media.playbackUrl(title.videoKey);
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
