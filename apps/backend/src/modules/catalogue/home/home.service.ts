import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { MediaService } from '../../media/media.service';
import type { TitleSummaryDto } from '../catalogue.service';
import {
  baseEligibility,
  buildSection,
  isUpcomingSection,
  matchesRules,
  parseSectionRules,
  type AccessType,
  type ContentFormat,
  type GenreParents,
  type HomeCandidate,
  type HomeSort,
  type SectionRules,
} from './section-rules';

/** Browse results are cached in memory for this long. */
export const HOME_CACHE_TTL_MS = 60_000;
export const DEFAULT_HOME_MAX_ROWS = 18;
const DAY_MS = 86_400_000;

/** Per-viewer rails the apps fetch themselves; never computed here. */
const PERSONAL_KINDS = new Set([
  'CONTINUE_WATCHING',
  'WATCHLIST',
  'RECOMMENDED',
  'BECAUSE_YOU_WATCHED',
]);

export interface HomeRow {
  slug: string;
  title: string;
  items: TitleSummaryDto[];
}

export interface HomePreview {
  rows: { slug: string; title: string; count: number; items: TitleSummaryDto[] }[];
  hidden: { slug: string; title: string; reason: string }[];
}

export interface SectionCount {
  eligibleCount: number | null;
  live: boolean;
}

export interface TitlePlacement {
  slug: string;
  title: string;
  eligible: boolean;
  reason?: string;
}

interface Snapshot {
  preview: HomePreview;
  counts: Map<string, SectionCount>;
}

const TITLE_INCLUDE = {
  genreLinks: { select: { genre: { select: { slug: true } } } },
  tagLinks: { select: { tag: { select: { slug: true } } } },
  industryLinks: { select: { industry: { select: { slug: true } } } },
  collectionLinks: {
    select: { position: true, addedAt: true, collection: { select: { slug: true } } },
  },
} satisfies Prisma.CatalogueTitleInclude;

type TitleWithLinks = Prisma.CatalogueTitleGetPayload<{ include: typeof TITLE_INCLUDE }>;

interface PlayCounts {
  d1: number;
  d7: number;
  all: number;
}

interface EpisodeStats {
  latestAt: Date | null;
}

interface Loaded {
  candidates: HomeCandidate[];
  summaries: Map<string, TitleSummaryDto>;
  genreParents: GenreParents;
}

/**
 * Rule-based homepage (docs/content-classification.md, "Homepage"). Computes
 * every enabled RULE section from the published catalogue in a handful of
 * queries and caches the result for {@link HOME_CACHE_TTL_MS}.
 */
@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);
  private cache: { at: number; promise: Promise<Snapshot> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly config: ConfigService,
  ) {}

  /** Browse rows: `{ slug, title, items }` for every live section. */
  async rows(): Promise<HomeRow[]> {
    const { preview } = await this.snapshot();
    return preview.rows.map(({ slug, title, items }) => ({ slug, title, items }));
  }

  /** Exactly what browse would return, plus why every other section is hidden. */
  async preview(): Promise<HomePreview> {
    return (await this.snapshot()).preview;
  }

  /** Per section id: eligible count (null for personal kinds) and live flag. */
  async sectionsWithCounts(): Promise<Map<string, SectionCount>> {
    return (await this.snapshot()).counts;
  }

  /**
   * Every enabled RULE section whose rules match the title (base eligibility
   * ignored), with `eligible`/`reason` from base eligibility. Pinned titles are
   * listed too; an excluded title is reported as not eligible.
   */
  async placementFor(titleId: string): Promise<TitlePlacement[]> {
    const [sections, loaded] = await Promise.all([this.loadSections(), this.load(titleId)]);
    const c = loaded.candidates[0];
    if (!c) return [];
    const now = new Date();
    const out: TitlePlacement[] = [];
    for (const s of sections) {
      if (!s.enabled || s.kind !== 'RULE') continue;
      let rules: SectionRules;
      try {
        rules = parseSectionRules(s.rules);
      } catch {
        continue;
      }
      const pinned = s.pinnedTitleIds.includes(c.id);
      if (!pinned && !matchesRules(c, rules, now, loaded.genreParents)) continue;
      const reason = s.excludedTitleIds.includes(c.id)
        ? 'Excluded from this section'
        : baseEligibility(c, now, isUpcomingSection(rules));
      out.push(
        reason
          ? { slug: s.slug, title: s.title, eligible: false, reason }
          : { slug: s.slug, title: s.title, eligible: true },
      );
    }
    return out;
  }

  /** Drop the cached browse rows (call after any classification/section write). */
  invalidate(): void {
    this.cache = null;
  }

  // ── Computation ────────────────────────────────────────────────────────────

  private maxRows(): number {
    const v = Number(this.config.get('homeMaxRows'));
    return Number.isFinite(v) && v >= 1 ? Math.floor(v) : DEFAULT_HOME_MAX_ROWS;
  }

  private snapshot(): Promise<Snapshot> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < HOME_CACHE_TTL_MS) return this.cache.promise;
    const entry = { at: now, promise: this.compute() };
    this.cache = entry;
    // Never cache a failure.
    entry.promise.catch(() => {
      if (this.cache === entry) this.cache = null;
    });
    return entry.promise;
  }

  private async compute(): Promise<Snapshot> {
    const [sections, loaded] = await Promise.all([this.loadSections(), this.load()]);
    const now = new Date();
    const maxRows = this.maxRows();
    const preview: HomePreview = { rows: [], hidden: [] };
    const counts = new Map<string, SectionCount>();

    for (const s of sections) {
      const personal = PERSONAL_KINDS.has(s.kind);
      let eligibleCount: number | null = null;
      let items: HomeCandidate[] = [];
      let invalid: string | null = null;
      if (!personal) {
        try {
          const built = buildSection(
            {
              rules: parseSectionRules(s.rules),
              sort: s.sort as HomeSort,
              limit: s.limit,
              pinnedTitleIds: s.pinnedTitleIds,
              excludedTitleIds: s.excludedTitleIds,
            },
            loaded.candidates,
            now,
            loaded.genreParents,
          );
          eligibleCount = built.eligibleCount;
          items = built.items;
        } catch (err) {
          invalid = (err as Error).message;
          eligibleCount = 0;
          this.logger.warn(`Homepage section "${s.slug}" has invalid rules: ${invalid}`);
        }
      }

      let reason: string | null = null;
      if (!s.enabled) reason = 'Disabled';
      else if (personal) reason = "Shown in the app's own rail";
      else if (invalid) reason = `Invalid rules: ${invalid}`;
      else if ((eligibleCount ?? 0) < s.minItems) {
        reason = `Only ${eligibleCount ?? 0} of ${s.minItems} titles`;
      } else if (preview.rows.length >= maxRows) reason = `Over the ${maxRows}-row limit`;

      if (reason) {
        preview.hidden.push({ slug: s.slug, title: s.title, reason });
      } else {
        preview.rows.push({
          slug: s.slug,
          title: s.title,
          count: eligibleCount ?? 0,
          items: items.map((c) => loaded.summaries.get(c.id)!).filter(Boolean),
        });
      }
      counts.set(s.id, { eligibleCount, live: reason === null });
    }
    return { preview, counts };
  }

  private loadSections() {
    return this.prisma.homepageSection.findMany({
      orderBy: [{ position: 'asc' }, { slug: 'asc' }],
    });
  }

  /**
   * Load candidates: every published title (or just `titleId`, any status),
   * their classification joins, play counts, episode stats and genre parents.
   */
  private async load(titleId?: string): Promise<Loaded> {
    const now = Date.now();
    const scope = titleId ? { titleId } : {};
    const started = (sinceMs?: number) => ({
      ...scope,
      startedAt: sinceMs === undefined ? { not: null } : { gte: new Date(now - sinceMs) },
    });
    const countBy = (where: Prisma.EntitlementWhereInput) =>
      this.prisma.entitlement.groupBy({ by: ['titleId'], where, _count: { _all: true } });
    const countEpisodesBy = (where: Prisma.EpisodePlaybackWhereInput) =>
      this.prisma.episodePlayback.groupBy({ by: ['titleId'], where, _count: { _all: true } });

    const [titles, genres, e1, e7, eAll, p1, p7, pAll, episodes] = await Promise.all([
      this.prisma.catalogueTitle.findMany({
        where: titleId ? { id: titleId } : { status: 'PUBLISHED' },
        include: TITLE_INCLUDE,
      }),
      this.prisma.genre.findMany({
        where: { parentId: { not: null } },
        select: { slug: true, parent: { select: { slug: true } } },
      }),
      countBy(started(DAY_MS)),
      countBy(started(7 * DAY_MS)),
      countBy(started()),
      countEpisodesBy(started(DAY_MS)),
      countEpisodesBy(started(7 * DAY_MS)),
      countEpisodesBy(started()),
      this.prisma.episode.groupBy({
        by: ['titleId'],
        where: { ...scope, videoKey: { not: null } },
        _max: { createdAt: true },
      }),
    ]);

    const plays = new Map<string, PlayCounts>();
    const add = (rows: { titleId: string; _count: { _all: number } }[], key: keyof PlayCounts) => {
      for (const r of rows) {
        const p = plays.get(r.titleId) ?? { d1: 0, d7: 0, all: 0 };
        p[key] += r._count._all;
        plays.set(r.titleId, p);
      }
    };
    add(e1, 'd1');
    add(p1, 'd1');
    add(e7, 'd7');
    add(p7, 'd7');
    add(eAll, 'all');
    add(pAll, 'all');

    const episodeStats = new Map<string, EpisodeStats>(
      episodes.map((e) => [e.titleId, { latestAt: e._max.createdAt ?? null }]),
    );
    const genreParents = new Map<string, string>();
    for (const g of genres) if (g.parent) genreParents.set(g.slug, g.parent.slug);

    const summaries = new Map<string, TitleSummaryDto>();
    const candidates = titles.map((t) => {
      summaries.set(t.id, this.toSummary(t));
      return toCandidate(t, plays.get(t.id), episodeStats.get(t.id));
    });
    return { candidates, summaries, genreParents };
  }

  /** Same shape and poster resolution as `CatalogueService.toSummary`. */
  private toSummary(t: TitleWithLinks): TitleSummaryDto {
    return {
      id: t.id,
      type: t.type.toLowerCase(),
      title: t.title,
      year: t.year,
      rating: t.rating,
      genres: t.genres,
      posterUrl: t.posterKey ? this.media.publicUrl(t.posterKey) : null,
    };
  }
}

/** Map a title row (+ joins, plays, episode stats) to its effective values. */
export function toCandidate(
  t: TitleWithLinks,
  plays: PlayCounts | undefined,
  episodes: EpisodeStats | undefined,
): HomeCandidate {
  const series = t.type === 'SERIES';
  const runtime = series
    ? null
    : (t.runtimeMinutes ??
      (t.durationSeconds !== null ? Math.round(t.durationSeconds / 60) : null));
  const access: AccessType = t.accessType ?? (t.priceMinor === 0 ? 'FREE' : 'PAY_PER_VIEW');
  const format: ContentFormat = t.contentFormat ?? (series ? 'TV_SERIES' : 'FEATURE_FILM');
  const collectionPositions: HomeCandidate['collectionPositions'] = {};
  for (const l of t.collectionLinks) {
    collectionPositions[l.collection.slug] = { position: l.position, addedAt: l.addedAt };
  }
  return {
    id: t.id,
    type: series ? 'series' : 'movie',
    published: t.status === 'PUBLISHED',
    format,
    genres: t.genreLinks.map((l) => l.genre.slug),
    tags: t.tagLinks.map((l) => l.tag.slug),
    collections: t.collectionLinks.map((l) => l.collection.slug),
    industries: t.industryLinks.map((l) => l.industry.slug),
    audience: t.audience,
    access,
    runtimeMinutes: runtime,
    releaseDate: t.releaseDate ?? new Date(Date.UTC(t.year, 0, 1)),
    publishedAt: t.publishedAt ?? t.updatedAt,
    isPremiere: t.isPremiere,
    premiereStartAt: t.premiereStartAt,
    availableFrom: t.availableFrom,
    availableUntil: t.availableUntil,
    seriesComplete: t.seriesComplete,
    latestEpisodeAt: series ? (episodes?.latestAt ?? null) : null,
    playable: series ? episodes !== undefined : Boolean(t.videoKey),
    popularity: t.popularity,
    rating: t.rating,
    plays1d: plays?.d1 ?? 0,
    plays7d: plays?.d7 ?? 0,
    playsAll: plays?.all ?? 0,
    collectionPositions,
  };
}
