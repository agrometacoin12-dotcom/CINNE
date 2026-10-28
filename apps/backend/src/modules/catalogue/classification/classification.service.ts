import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AccessType,
  Audience,
  CollectionKind,
  ContentFormat,
  Prisma,
  TagKind,
} from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditService } from '../../auth/audit.service';
import { HomeService } from '../home/home.service';
import { deriveIndustries } from '../home/industry';
import {
  ACCESS_TYPE_LABELS,
  ACCESS_TYPE_VALUES,
  AUDIENCE_LABELS,
  AUDIENCE_VALUES,
  CONTENT_FORMAT_LABELS,
  CONTENT_FORMAT_VALUES,
  COUNTRY_CODE_RE,
  DECADES,
  LANGUAGE_CODE_RE,
  LANGUAGES,
  NEW_LISTINGS_SLUG,
  RELEASE_DATE_RE,
  effectiveAccess,
  effectiveFormat,
} from './taxonomy.constants';

/** PUT titles/:id/classification. `undefined` = unchanged, `null` = clear. */
export interface ClassificationInput {
  contentFormat?: ContentFormat | null;
  /** Genre/subgenre slugs; selection order is kept. */
  genres?: string[];
  tags?: string[];
  collections?: string[];
  /** MANUAL industries only; AUTO ones are recomputed on every write. */
  industries?: string[];
  audience?: Audience | null;
  ageRating?: string | null;
  ratingJurisdiction?: string | null;
  /** 'YYYY-MM-DD'. */
  releaseDate?: string | null;
  accessType?: AccessType | null;
  productionCountries?: string[];
  originalLanguages?: string[];
  audioLanguages?: string[];
  availableFrom?: string | null;
  availableUntil?: string | null;
  seriesComplete?: boolean;
}

export interface ClassificationDto {
  titleId: string;
  type: 'movie' | 'series';
  contentFormat: ContentFormat | null;
  effectiveFormat: ContentFormat;
  genres: string[];
  tags: string[];
  collections: string[];
  industries: { slug: string; name: string; source: 'manual' | 'auto' }[];
  audience: Audience | null;
  ageRating: string | null;
  ratingJurisdiction: string | null;
  releaseDate: string | null;
  accessType: AccessType | null;
  effectiveAccess: AccessType;
  productionCountries: string[];
  originalLanguages: string[];
  audioLanguages: string[];
  availableFrom: string | null;
  availableUntil: string | null;
  seriesComplete: boolean;
  /** Every enabled RULE section whose rules match this title. */
  placement: { slug: string; title: string; eligible: boolean; reason?: string }[];
}

export interface TaxonomyDto {
  genres: { slug: string; name: string; subgenres: { slug: string; name: string }[] }[];
  tags: { slug: string; name: string; kind: TagKind }[];
  industries: { slug: string; name: string }[];
  collections: { slug: string; name: string; kind: CollectionKind }[];
  formats: { value: ContentFormat; label: string }[];
  audiences: { value: Audience; label: string }[];
  accessTypes: { value: AccessType; label: string }[];
  languages: { code: string; name: string }[];
  decades: string[];
}

const TITLE_INCLUDE = {
  genreLinks: { orderBy: { position: 'asc' }, include: { genre: true } },
  tagLinks: { include: { tag: true } },
  industryLinks: { include: { industry: true } },
  collectionLinks: { include: { collection: true } },
} satisfies Prisma.CatalogueTitleInclude;

type ClassifiedTitle = Prisma.CatalogueTitleGetPayload<{ include: typeof TITLE_INCLUDE }>;

type Tx = Prisma.TransactionClient;

const TAG_KIND_ORDER: TagKind[] = ['MOOD', 'THEME', 'SETTING', 'CHARACTER', 'STORY'];

interface GenreRow {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
}

/** Order-preserving de-duplication of trimmed, non-empty values. */
const uniq = (xs: string[], norm: (s: string) => string = (s) => s): string[] => {
  const out: string[] = [];
  for (const x of xs) {
    const v = norm(String(x).trim());
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
};

const lower = (s: string) => s.toLowerCase();
const upper = (s: string) => s.toUpperCase();

/** Same slug rules as the seeded vocabulary: lower-case, `&` dropped, hyphens. */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const isoTime = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Reads and writes a title's classification (docs/content-classification.md):
 * vocabulary join rows, AUTO industries, and the legacy `genres`/`categories`
 * columns the older admin editors and browse paths still read.
 */
@Injectable()
export class ClassificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly home: HomeService,
  ) {}

  /** Every vocabulary and fixed choice an admin editor needs. */
  async taxonomy(): Promise<TaxonomyDto> {
    const [genres, tags, industries, collections] = await Promise.all([
      this.prisma.genre.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      this.prisma.tag.findMany({ orderBy: [{ kind: 'asc' }, { position: 'asc' }] }),
      this.prisma.industry.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      this.prisma.collection.findMany({ orderBy: [{ kind: 'asc' }, { position: 'asc' }] }),
    ]);
    const tops = genres.filter((g) => !g.parentId);
    return {
      genres: tops.map((g) => ({
        slug: g.slug,
        name: g.name,
        subgenres: genres
          .filter((s) => s.parentId === g.id)
          .map((s) => ({ slug: s.slug, name: s.name })),
      })),
      tags: tags.map((t) => ({ slug: t.slug, name: t.name, kind: t.kind })),
      industries: industries.map((i) => ({ slug: i.slug, name: i.name })),
      collections: collections.map((c) => ({ slug: c.slug, name: c.name, kind: c.kind })),
      formats: CONTENT_FORMAT_LABELS,
      audiences: AUDIENCE_LABELS,
      accessTypes: ACCESS_TYPE_LABELS,
      languages: LANGUAGES,
      decades: DECADES,
    };
  }

  /** A title's classification plus its homepage placement. 404 when unknown. */
  async get(titleId: string): Promise<ClassificationDto> {
    const row = await this.prisma.catalogueTitle.findUnique({
      where: { id: titleId },
      include: TITLE_INCLUDE,
    });
    if (!row) throw new NotFoundException('Title not found');
    const placement = await this.home.placementFor(titleId);
    return toDto(row, placement);
  }

  /** Validate and apply a classification write in one transaction. */
  async update(
    titleId: string,
    input: ClassificationInput,
    actorId: string,
  ): Promise<ClassificationDto> {
    const existing = await this.prisma.catalogueTitle.findUnique({ where: { id: titleId } });
    if (!existing) throw new NotFoundException('Title not found');

    const genres = input.genres !== undefined ? uniq(input.genres, lower) : undefined;
    const tags = input.tags !== undefined ? uniq(input.tags, lower) : undefined;
    const collections =
      input.collections !== undefined ? uniq(input.collections, lower) : undefined;
    const industries = input.industries !== undefined ? uniq(input.industries, lower) : undefined;
    const countries =
      input.productionCountries !== undefined ? uniq(input.productionCountries, upper) : undefined;
    const originalLanguages =
      input.originalLanguages !== undefined ? uniq(input.originalLanguages, lower) : undefined;
    const audioLanguages =
      input.audioLanguages !== undefined ? uniq(input.audioLanguages, lower) : undefined;

    // ── Field validation ────────────────────────────────────────────────────
    const errors: string[] = [];
    if (input.contentFormat != null && !CONTENT_FORMAT_VALUES.includes(input.contentFormat)) {
      errors.push(`Unknown contentFormat: ${input.contentFormat}`);
    }
    if (input.audience != null && !AUDIENCE_VALUES.includes(input.audience)) {
      errors.push(`Unknown audience: ${input.audience}`);
    }
    if (input.accessType != null && !ACCESS_TYPE_VALUES.includes(input.accessType)) {
      errors.push(`Unknown accessType: ${input.accessType}`);
    }
    const badCountries = (countries ?? []).filter((c) => !COUNTRY_CODE_RE.test(c));
    if (badCountries.length) errors.push(`Invalid country codes: ${badCountries.join(', ')}`);
    const badLanguages = [...(originalLanguages ?? []), ...(audioLanguages ?? [])].filter(
      (l) => !LANGUAGE_CODE_RE.test(l),
    );
    if (badLanguages.length) errors.push(`Invalid language codes: ${badLanguages.join(', ')}`);

    let releaseDate: Date | null | undefined;
    if (input.releaseDate === null) releaseDate = null;
    else if (input.releaseDate !== undefined) {
      releaseDate = parseReleaseDate(input.releaseDate);
      if (!releaseDate) errors.push('releaseDate must be a valid YYYY-MM-DD date');
    }
    const availableFrom = parseTimestamp(input.availableFrom, 'availableFrom', errors);
    const availableUntil = parseTimestamp(input.availableUntil, 'availableUntil', errors);
    if (errors.length) throw new BadRequestException(errors.join('; '));

    const effFrom = availableFrom !== undefined ? availableFrom : existing.availableFrom;
    const effUntil = availableUntil !== undefined ? availableUntil : existing.availableUntil;
    if (effFrom && effUntil && effUntil.getTime() <= effFrom.getTime()) {
      throw new BadRequestException('availableUntil must be after availableFrom');
    }

    // ── Vocabulary lookups (unknown slugs → 400 naming them) ────────────────
    const [genreRows, tagRows, collectionRows, industryRows, allIndustries] = await Promise.all([
      genres?.length
        ? this.prisma.genre.findMany({ where: { slug: { in: genres } } })
        : Promise.resolve([]),
      tags?.length
        ? this.prisma.tag.findMany({ where: { slug: { in: tags } } })
        : Promise.resolve([]),
      collections?.length
        ? this.prisma.collection.findMany({ where: { slug: { in: collections } } })
        : Promise.resolve([]),
      industries?.length
        ? this.prisma.industry.findMany({ where: { slug: { in: industries } } })
        : Promise.resolve([]),
      this.prisma.industry.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
    ]);
    const unknown: string[] = [];
    const missing = (label: string, wanted: string[] | undefined, rows: { slug: string }[]) => {
      const known = new Set(rows.map((r) => r.slug));
      const bad = (wanted ?? []).filter((s) => !known.has(s));
      if (bad.length) unknown.push(`unknown ${label}: ${bad.join(', ')}`);
    };
    missing('genres', genres, genreRows);
    missing('tags', tags, tagRows);
    missing('collections', collections, collectionRows);
    missing('industries', industries, industryRows);
    if (unknown.length) {
      const msg = unknown.join('; ');
      throw new BadRequestException(msg.charAt(0).toUpperCase() + msg.slice(1));
    }

    // Parent names for the legacy `genres` mirror.
    let legacyGenreNames: string[] | undefined;
    if (genres) {
      const parentIds = genreRows.map((g) => g.parentId).filter((id): id is string => !!id);
      const parents = parentIds.length
        ? await this.prisma.genre.findMany({ where: { id: { in: parentIds } } })
        : [];
      const byId = new Map<string, GenreRow>([...genreRows, ...parents].map((g) => [g.id, g]));
      const bySlug = new Map(genreRows.map((g) => [g.slug, g]));
      legacyGenreNames = uniq(
        genres.map((slug) => {
          const g = bySlug.get(slug) as GenreRow;
          return g.parentId ? (byId.get(g.parentId)?.name ?? g.name) : g.name;
        }),
      );
    }

    // ── Write ───────────────────────────────────────────────────────────────
    const data: Prisma.CatalogueTitleUpdateInput = {};
    if (input.contentFormat !== undefined) data.contentFormat = input.contentFormat;
    if (input.audience !== undefined) data.audience = input.audience;
    if (input.ageRating !== undefined) data.ageRating = input.ageRating?.trim() || null;
    if (input.ratingJurisdiction !== undefined)
      data.ratingJurisdiction = input.ratingJurisdiction?.trim() || null;
    if (releaseDate !== undefined) data.releaseDate = releaseDate;
    if (input.accessType !== undefined) data.accessType = input.accessType;
    if (countries) data.productionCountries = countries;
    if (originalLanguages) data.originalLanguages = originalLanguages;
    if (audioLanguages) data.audioLanguages = audioLanguages;
    if (availableFrom !== undefined) data.availableFrom = availableFrom;
    if (availableUntil !== undefined) data.availableUntil = availableUntil;
    if (input.seriesComplete !== undefined) data.seriesComplete = input.seriesComplete;
    if (legacyGenreNames) data.genres = legacyGenreNames;
    if (collections) data.categories = uniq([...collections, NEW_LISTINGS_SLUG]);

    const autoSlugs = deriveIndustries(
      countries ?? existing.productionCountries ?? [],
      originalLanguages ?? existing.originalLanguages ?? [],
      allIndustries,
    );
    const industryIdBySlug = new Map(allIndustries.map((i) => [i.slug, i.id]));
    const autoIds = autoSlugs
      .map((s) => industryIdBySlug.get(s))
      .filter((id): id is string => !!id);

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.catalogueTitle.update({ where: { id: titleId }, data });
      }
      if (genres) {
        const idBySlug = new Map(genreRows.map((g) => [g.slug, g.id]));
        await this.replaceGenres(
          tx,
          titleId,
          genres.map((s) => idBySlug.get(s) as string),
        );
      }
      if (tags) {
        await tx.titleTag.deleteMany({ where: { titleId } });
        if (tagRows.length) {
          await tx.titleTag.createMany({
            data: tagRows.map((t) => ({ titleId, tagId: t.id })),
            skipDuplicates: true,
          });
        }
      }
      if (collections) {
        await this.replaceCollections(
          tx,
          titleId,
          collectionRows.map((c) => c.id),
        );
      }
      // AUTO rows are always recomputed; MANUAL rows only when given.
      await tx.titleIndustry.deleteMany({ where: { titleId, source: 'AUTO' } });
      if (industries) {
        await tx.titleIndustry.deleteMany({ where: { titleId, source: 'MANUAL' } });
        if (industryRows.length) {
          await tx.titleIndustry.createMany({
            data: industryRows.map((i) => ({ titleId, industryId: i.id, source: 'MANUAL' })),
            skipDuplicates: true,
          });
        }
      }
      if (autoIds.length) {
        // A MANUAL row for the same industry wins (same primary key).
        await tx.titleIndustry.createMany({
          data: autoIds.map((industryId) => ({ titleId, industryId, source: 'AUTO' })),
          skipDuplicates: true,
        });
      }
    });

    await this.audit.record({
      actorId,
      action: 'admin.title.classify',
      entity: 'Title',
      entityId: titleId,
      metadata: {
        fields: Object.keys(input).filter(
          (k) => input[k as keyof ClassificationInput] !== undefined,
        ),
      },
    });
    this.home.invalidate();
    return this.get(titleId);
  }

  /**
   * Mirror the legacy movie/series editors' free-text `genres` and category
   * slugs onto the join tables. Names match top-level genres by name or slug
   * (case-insensitive); unknown names stay only in the legacy column. Existing
   * subgenre picks under a still-selected parent are kept. A title that is not
   * in Postgres (non-Prisma catalogue driver) is ignored.
   */
  async syncLegacy(
    titleId: string,
    legacy: { genres?: string[]; categories?: string[] },
  ): Promise<void> {
    if (legacy.genres === undefined && legacy.categories === undefined) return;
    const title = await this.prisma.catalogueTitle.findUnique({
      where: { id: titleId },
      select: { id: true },
    });
    if (!title) return;

    let genreIds: string[] | undefined;
    if (legacy.genres !== undefined) {
      const all: GenreRow[] = await this.prisma.genre.findMany({
        select: { id: true, slug: true, name: true, parentId: true },
      });
      const tops = all.filter((g) => !g.parentId);
      const matched: GenreRow[] = [];
      for (const raw of legacy.genres) {
        const name = String(raw).trim().toLowerCase();
        if (!name) continue;
        const g = tops.find(
          (t) => t.name.toLowerCase() === name || t.slug === name || t.slug === slugify(name),
        );
        if (g && !matched.includes(g)) matched.push(g);
      }
      const current = await this.prisma.titleGenre.findMany({
        where: { titleId },
        orderBy: { position: 'asc' },
        select: { genreId: true },
      });
      const byId = new Map(all.map((g) => [g.id, g]));
      genreIds = [];
      for (const parent of matched) {
        // Keep this parent's existing picks (itself and/or its subgenres) in order.
        const kept = current
          .map((c) => byId.get(c.genreId))
          .filter((g): g is GenreRow => !!g && (g.id === parent.id || g.parentId === parent.id))
          .map((g) => g.id);
        genreIds.push(...(kept.length ? kept : [parent.id]));
      }
    }

    let collectionIds: string[] | undefined;
    if (legacy.categories !== undefined) {
      const slugs = uniq(legacy.categories, lower);
      const rows = slugs.length
        ? await this.prisma.collection.findMany({
            where: { slug: { in: slugs } },
            select: { id: true },
          })
        : [];
      collectionIds = rows.map((r) => r.id);
    }

    await this.prisma.$transaction(async (tx) => {
      if (genreIds) await this.replaceGenres(tx, titleId, genreIds);
      if (collectionIds) await this.replaceCollections(tx, titleId, collectionIds);
    });
    this.home.invalidate();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Replace genre links; `position` = selection order. */
  private async replaceGenres(tx: Tx, titleId: string, genreIds: string[]): Promise<void> {
    await tx.titleGenre.deleteMany({ where: { titleId } });
    if (genreIds.length) {
      await tx.titleGenre.createMany({
        data: genreIds.map((genreId, position) => ({ titleId, genreId, position })),
        skipDuplicates: true,
      });
    }
  }

  /**
   * Make the title's collections exactly `collectionIds`. Rows that stay keep
   * their manual `position` and `addedAt` (MANUAL sort / "recently added").
   */
  private async replaceCollections(
    tx: Tx,
    titleId: string,
    collectionIds: string[],
  ): Promise<void> {
    await tx.titleCollection.deleteMany({
      where: { titleId, collectionId: { notIn: collectionIds } },
    });
    if (collectionIds.length) {
      await tx.titleCollection.createMany({
        data: collectionIds.map((collectionId) => ({ titleId, collectionId })),
        skipDuplicates: true,
      });
    }
  }
}

function parseReleaseDate(value: string): Date | null {
  if (!RELEASE_DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || isoDate(d) !== value ? null : d;
}

function parseTimestamp(
  value: string | null | undefined,
  field: string,
  errors: string[],
): Date | null | undefined {
  if (value === undefined || value === null) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    errors.push(`${field} must be an ISO timestamp`);
    return undefined;
  }
  return d;
}

function toDto(row: ClassifiedTitle, placement: ClassificationDto['placement']): ClassificationDto {
  return {
    titleId: row.id,
    type: row.type === 'SERIES' ? 'series' : 'movie',
    contentFormat: row.contentFormat,
    effectiveFormat: effectiveFormat(row.type, row.contentFormat),
    genres: row.genreLinks.map((l) => l.genre.slug),
    tags: [...row.tagLinks]
      .sort(
        (a, b) =>
          TAG_KIND_ORDER.indexOf(a.tag.kind) - TAG_KIND_ORDER.indexOf(b.tag.kind) ||
          a.tag.position - b.tag.position,
      )
      .map((l) => l.tag.slug),
    collections: [...row.collectionLinks]
      .sort((a, b) => a.collection.position - b.collection.position)
      .map((l) => l.collection.slug),
    industries: [...row.industryLinks]
      .sort((a, b) => a.industry.position - b.industry.position)
      .map((l) => ({
        slug: l.industry.slug,
        name: l.industry.name,
        source: l.source === 'AUTO' ? ('auto' as const) : ('manual' as const),
      })),
    audience: row.audience,
    ageRating: row.ageRating,
    ratingJurisdiction: row.ratingJurisdiction,
    releaseDate: isoDate(row.releaseDate),
    accessType: row.accessType,
    effectiveAccess: effectiveAccess(row.accessType, row.priceMinor),
    productionCountries: row.productionCountries ?? [],
    originalLanguages: row.originalLanguages ?? [],
    audioLanguages: row.audioLanguages ?? [],
    availableFrom: isoTime(row.availableFrom),
    availableUntil: isoTime(row.availableUntil),
    seriesComplete: row.seriesComplete,
    placement,
  };
}
