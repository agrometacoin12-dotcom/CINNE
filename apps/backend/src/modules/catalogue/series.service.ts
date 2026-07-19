import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Viewer-facing episode: never exposes raw object keys. */
export interface ViewerEpisodeDto {
  id: string;
  number: number;
  name: string;
  overview: string | null;
  runtimeMinutes: number | null;
  hasVideo: boolean;
  /** Present only when the request is authenticated. */
  consumed?: boolean;
}

export interface ViewerSeasonDto {
  id: string;
  number: number;
  name: string | null;
  episodes: ViewerEpisodeDto[];
}

/**
 * Viewer-side season/episode listing for a series title. Published titles
 * only — the caller resolves the title through the catalogue first; this
 * service double-checks publication before exposing the tree. Raw video keys
 * never leave the server: viewers only see `hasVideo` booleans, and playback
 * URLs are minted per-session by the playback module.
 */
@Injectable()
export class SeriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The seasons tree for a PUBLISHED series, episodes ordered by number. When
   * `userId` is present each episode carries its watch-once `consumed` flag;
   * unauthenticated requests omit the field entirely.
   */
  async viewerSeasons(titleId: string, userId?: string): Promise<ViewerSeasonDto[] | null> {
    const title = await this.prisma.catalogueTitle.findUnique({
      where: { id: titleId },
      select: { type: true, status: true },
    });
    if (!title || title.type !== 'SERIES' || title.status !== 'PUBLISHED') return null;

    const seasons = await this.prisma.season.findMany({
      where: { titleId },
      orderBy: { number: 'asc' },
      include: { episodes: { orderBy: { number: 'asc' } } },
    });

    const consumedIds = userId ? await this.consumedEpisodeIds(userId, titleId) : null;

    return seasons.map((s) => ({
      id: s.id,
      number: s.number,
      name: s.name,
      episodes: s.episodes.map((e) => ({
        id: e.id,
        number: e.number,
        name: e.name,
        overview: e.overview,
        runtimeMinutes: e.runtimeMinutes,
        hasVideo: Boolean(e.videoKey),
        ...(consumedIds ? { consumed: consumedIds.has(e.id) } : {}),
      })),
    }));
  }

  private async consumedEpisodeIds(userId: string, titleId: string): Promise<Set<string>> {
    const rows = await this.prisma.episodePlayback.findMany({
      where: { userId, titleId, consumedAt: { not: null } },
      select: { episodeId: true },
    });
    return new Set(rows.map((r) => r.episodeId));
  }
}
