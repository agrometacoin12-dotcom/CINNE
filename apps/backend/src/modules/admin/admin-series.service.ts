import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { Episode, Season } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { MediaService } from '../media/media.service';
import { AuditService } from '../auth/audit.service';
import { EventBus } from '../../infra/events/event-bus';
import { NEW_LISTINGS_CATEGORY, type Title } from '../catalogue/domain/title.entity';
import type {
  CreateEpisodeDto,
  CreateSeasonDto,
  CreateSeriesDto,
  UpdateEpisodeDto,
  UpdateSeasonDto,
  UpdateSeriesDto,
} from './dto/admin-series.dto';

/** Clamp a (possibly NaN) pagination number into a sane range. */
const clamp = (value: number | undefined, fallback: number, min: number, max: number) => {
  const n = Number.isFinite(value) ? (value as number) : fallback;
  return Math.min(Math.max(n, min), max);
};

/** True when a Prisma error is a unique-constraint violation (P2002). */
const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/**
 * Admin CRUD for series: the CatalogueTitle (type SERIES) plus its seasons and
 * episodes. Seasons/episodes are Postgres-only (Prisma), while series title
 * metadata goes through the CatalogueService so pricing/publishing behave
 * exactly like movies. `CatalogueTitle.seasons` stays a derived season count,
 * refreshed on every season create/delete.
 */
@Injectable()
export class AdminSeriesService {
  private readonly defaultCurrency: string;

  constructor(
    private readonly catalogue: CatalogueService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.defaultCurrency = config.get<string>('defaultCurrency') ?? 'NGN';
  }

  // ── Series (CatalogueTitle type SERIES) ─────────────────────────────────────

  /** Paged list of series with season/episode counts, newest first. */
  async list(query?: string, take = 50, skip = 0) {
    const where: Prisma.CatalogueTitleWhereInput = {
      type: 'SERIES',
      ...(query ? { title: { contains: query, mode: 'insensitive' as const } } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.catalogueTitle.count({ where }),
      this.prisma.catalogueTitle.findMany({
        where,
        include: { _count: { select: { seasonRecords: true } } },
        orderBy: { createdAt: 'desc' },
        take: clamp(take, 50, 1, 200),
        skip: clamp(skip, 0, 0, Number.MAX_SAFE_INTEGER),
      }),
    ]);

    const ids = rows.map((r) => r.id);
    const episodeCounts = ids.length
      ? await this.prisma.episode.groupBy({
          by: ['titleId'],
          where: { titleId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const episodesByTitle = new Map(episodeCounts.map((c) => [c.titleId, c._count._all]));

    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        year: r.year,
        status: r.status.toLowerCase() as 'draft' | 'published',
        featured: r.featured,
        priceMinor: r.priceMinor,
        currency: r.currency,
        posterUrl: r.posterKey ? this.media.publicUrl(r.posterKey) : null,
        seasonCount: r._count.seasonRecords,
        episodeCount: episodesByTitle.get(r.id) ?? 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }

  /** Create a series shell (DRAFT) — seasons/episodes are added afterwards. */
  async create(dto: CreateSeriesDto, actorId: string) {
    const id = randomUUID();
    const title: Title = {
      id,
      type: 'series',
      title: dto.title,
      tagline: dto.tagline ?? null,
      overview: dto.overview,
      year: dto.year,
      genres: dto.genres ?? [],
      runtimeMinutes: null,
      seasons: 0,
      maturityRating: dto.maturityRating ?? null,
      rating: 0,
      posterKey: dto.posterKey ?? null,
      heroKey: dto.heroKey ?? null,
      cast: dto.cast ?? [],
      director: dto.director ?? null,
      // Always include "new-listings" so every admin upload surfaces in the
      // New Listings row for users, regardless of any categories chosen.
      categories: [...new Set([...(dto.categories ?? []), NEW_LISTINGS_CATEGORY])],
      popularity: 50,
      featured: false,
      status: 'draft',
      priceMinor: dto.priceMinor,
      currency: dto.currency ?? this.defaultCurrency,
      videoKey: null,
      durationSeconds: null,
      isPremiere: false,
      premiereStartAt: null,
    };
    const created = await this.catalogue.createTitle(title);
    // The featured hero is unique; route through setFeatured to unset others.
    if (dto.featured) await this.catalogue.setFeatured(id, true);
    await this.audit.record({
      actorId,
      action: 'admin.series.create',
      entity: 'Title',
      entityId: id,
    });
    await this.events.publish({
      name: 'series.created',
      detail: { titleId: id, title: dto.title },
    });
    return dto.featured ? this.get(id) : { ...created, seasons: [] };
  }

  /** Full tree: title fields + seasons + episodes (admin keys included). */
  async get(id: string) {
    const title = await this.findSeriesOr404(id);
    const detail = await this.catalogue.adminGet(title.id);
    const seasons = await this.prisma.season.findMany({
      where: { titleId: id },
      orderBy: { number: 'asc' },
      include: { episodes: { orderBy: { number: 'asc' } } },
    });
    return {
      ...detail,
      seasons: seasons.map((s) => this.toAdminSeason(s)),
    };
  }

  /** Partial metadata/status update. Publishing requires a playable episode. */
  async update(id: string, dto: UpdateSeriesDto, actorId: string) {
    const existing = await this.findSeriesOr404(id);

    if (dto.status === 'published' && existing.status !== 'published') {
      const playable = await this.prisma.episode.count({
        where: { titleId: id, videoKey: { not: null } },
      });
      if (playable === 0) {
        throw new UnprocessableEntityException(
          'A series needs at least one episode with a video before it can be published.',
        );
      }
    }

    const patch: Partial<Title> = {};
    // `undefined` = unchanged; explicit `null` = clear (nullable fields only).
    const assign = <K extends keyof Title>(k: K, v: Title[K] | undefined) => {
      if (v !== undefined) patch[k] = v;
    };
    assign('title', dto.title);
    assign('tagline', dto.tagline);
    assign('overview', dto.overview);
    assign('year', dto.year);
    assign('genres', dto.genres);
    assign('cast', dto.cast);
    assign('director', dto.director);
    // Keep "new-listings" on edit too, so re-saved series stay in the row.
    if (dto.categories) patch.categories = [...new Set([...dto.categories, NEW_LISTINGS_CATEGORY])];
    assign('maturityRating', dto.maturityRating);
    assign('priceMinor', dto.priceMinor);
    assign('currency', dto.currency);
    assign('posterKey', dto.posterKey);
    assign('heroKey', dto.heroKey);
    assign('popularity', dto.popularity);
    assign('status', dto.status);

    await this.catalogue.updateTitle(id, patch);
    if (dto.featured !== undefined) await this.catalogue.setFeatured(id, dto.featured);
    await this.audit.record({
      actorId,
      action: 'admin.series.update',
      entity: 'Title',
      entityId: id,
    });
    return this.get(id);
  }

  /** Permanently delete a series; seasons/episodes cascade at the DB level. */
  async delete(id: string, actorId: string) {
    const existing = await this.findSeriesOr404(id);
    const soldTickets = await this.prisma.purchase.count({ where: { titleId: id } });
    await this.catalogue.deleteTitle(id);
    await this.audit.record({
      actorId,
      action: 'admin.series.delete',
      entity: 'Title',
      entityId: id,
      metadata: { title: existing.title, soldTickets },
    });
    return { deleted: true, id, soldTickets };
  }

  // ── Seasons ─────────────────────────────────────────────────────────────────

  async createSeason(titleId: string, dto: CreateSeasonDto, actorId: string) {
    await this.findSeriesOr404(titleId);
    let season;
    try {
      season = await this.prisma.season.create({
        data: {
          titleId,
          number: dto.number,
          name: dto.name ?? null,
          overview: dto.overview ?? null,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Season ${dto.number} already exists for this series.`);
      }
      throw err;
    }
    await this.syncSeasonCount(titleId);
    await this.audit.record({
      actorId,
      action: 'admin.season.create',
      entity: 'Season',
      entityId: season.id,
      metadata: { titleId, number: dto.number },
    });
    return this.toAdminSeason({ ...season, episodes: [] });
  }

  async updateSeason(seasonId: string, dto: UpdateSeasonDto, actorId: string) {
    const existing = await this.getSeasonOr404(seasonId);
    const data: Prisma.SeasonUpdateInput = {};
    if (dto.number !== undefined) data.number = dto.number;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.overview !== undefined) data.overview = dto.overview;
    let season;
    try {
      season = await this.prisma.season.update({
        where: { id: seasonId },
        data,
        include: { episodes: { orderBy: { number: 'asc' } } },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Season ${dto.number} already exists for this series.`);
      }
      throw err;
    }
    await this.audit.record({
      actorId,
      action: 'admin.season.update',
      entity: 'Season',
      entityId: seasonId,
      metadata: { titleId: existing.titleId },
    });
    return this.toAdminSeason(season);
  }

  async deleteSeason(seasonId: string, actorId: string) {
    const existing = await this.getSeasonOr404(seasonId);
    await this.prisma.season.delete({ where: { id: seasonId } });
    await this.syncSeasonCount(existing.titleId);
    await this.audit.record({
      actorId,
      action: 'admin.season.delete',
      entity: 'Season',
      entityId: seasonId,
      metadata: { titleId: existing.titleId, number: existing.number },
    });
    return { deleted: true, id: seasonId };
  }

  // ── Episodes ────────────────────────────────────────────────────────────────

  async createEpisode(seasonId: string, dto: CreateEpisodeDto, actorId: string) {
    const season = await this.getSeasonOr404(seasonId);
    let episode;
    try {
      episode = await this.prisma.episode.create({
        data: {
          seasonId,
          titleId: season.titleId,
          number: dto.number,
          name: dto.name,
          overview: dto.overview ?? null,
          runtimeMinutes: dto.runtimeMinutes ?? null,
          durationSeconds: dto.runtimeMinutes ? dto.runtimeMinutes * 60 : null,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Episode ${dto.number} already exists in this season.`);
      }
      throw err;
    }
    await this.audit.record({
      actorId,
      action: 'admin.episode.create',
      entity: 'Episode',
      entityId: episode.id,
      metadata: { titleId: season.titleId, seasonId, number: dto.number },
    });
    return this.toAdminEpisode(episode);
  }

  async updateEpisode(episodeId: string, dto: UpdateEpisodeDto, actorId: string) {
    const existing = await this.getEpisodeOr404(episodeId);
    const data: Prisma.EpisodeUpdateInput = {};
    if (dto.number !== undefined) data.number = dto.number;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.overview !== undefined) data.overview = dto.overview;
    if (dto.runtimeMinutes !== undefined) data.runtimeMinutes = dto.runtimeMinutes;
    if (dto.durationSeconds !== undefined) data.durationSeconds = dto.durationSeconds;
    if (dto.videoKey !== undefined) data.videoKey = dto.videoKey;
    if (dto.stillKey !== undefined) data.stillKey = dto.stillKey;
    let episode;
    try {
      episode = await this.prisma.episode.update({ where: { id: episodeId }, data });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Episode ${dto.number} already exists in this season.`);
      }
      throw err;
    }
    await this.audit.record({
      actorId,
      action: 'admin.episode.update',
      entity: 'Episode',
      entityId: episodeId,
      metadata: { titleId: existing.titleId },
    });
    return this.toAdminEpisode(episode);
  }

  async deleteEpisode(episodeId: string, actorId: string) {
    const existing = await this.getEpisodeOr404(episodeId);
    await this.prisma.episode.delete({ where: { id: episodeId } });
    await this.audit.record({
      actorId,
      action: 'admin.episode.delete',
      entity: 'Episode',
      entityId: episodeId,
      metadata: { titleId: existing.titleId, seasonId: existing.seasonId },
    });
    return { deleted: true, id: episodeId };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private async findSeriesOr404(id: string): Promise<Title> {
    const title = await this.catalogue.findRaw(id);
    if (!title || title.type !== 'series') throw new NotFoundException('Series not found');
    return title;
  }

  private async getSeasonOr404(seasonId: string): Promise<Season> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('Season not found');
    return season;
  }

  private async getEpisodeOr404(episodeId: string): Promise<Episode> {
    const episode = await this.prisma.episode.findUnique({ where: { id: episodeId } });
    if (!episode) throw new NotFoundException('Episode not found');
    return episode;
  }

  /** Refresh the derived `CatalogueTitle.seasons` count after season writes. */
  private async syncSeasonCount(titleId: string): Promise<void> {
    const count = await this.prisma.season.count({ where: { titleId } });
    await this.catalogue.updateTitle(titleId, { seasons: count });
  }

  private toAdminSeason(season: Season & { episodes: Episode[] }) {
    return {
      id: season.id,
      number: season.number,
      name: season.name,
      overview: season.overview,
      episodes: season.episodes.map((e) => this.toAdminEpisode(e)),
    };
  }

  private toAdminEpisode(e: Episode) {
    return {
      id: e.id,
      number: e.number,
      name: e.name,
      overview: e.overview,
      runtimeMinutes: e.runtimeMinutes,
      durationSeconds: e.durationSeconds,
      videoKey: e.videoKey,
      stillKey: e.stillKey,
      stillUrl: e.stillKey ? this.media.publicUrl(e.stillKey) : null,
      hasVideo: Boolean(e.videoKey),
    };
  }
}
