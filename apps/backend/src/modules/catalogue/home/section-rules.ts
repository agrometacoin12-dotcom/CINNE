/**
 * Rule engine for the rule-based homepage (docs/content-classification.md,
 * "Section rules"). Pure and framework-free: no Nest, no Prisma client, no
 * clock — callers pass `now` and the candidates' effective values.
 */

export const CONTENT_FORMATS = [
  'FEATURE_FILM',
  'SHORT_FILM',
  'TV_SERIES',
  'LIMITED_SERIES',
  'MINISERIES',
  'DOCUMENTARY_FILM',
  'DOCUMENTARY_SERIES',
  'ANIMATION_FILM',
  'ANIMATED_SERIES',
  'STANDUP_COMEDY',
  'LIVE_PERFORMANCE',
  'SPECIAL',
  'ANTHOLOGY',
  'REALITY_SERIES',
  'MUSIC_FILM',
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const AUDIENCES = ['KIDS', 'TEENS', 'FAMILY', 'ADULTS'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const ACCESS_TYPES = [
  'FREE',
  'SUBSCRIPTION',
  'PAY_PER_VIEW',
  'RENTAL',
  'PURCHASE',
  'PROMOTIONAL',
] as const;
export type AccessType = (typeof ACCESS_TYPES)[number];

export const HOME_SORTS = [
  'POPULARITY',
  'PUBLISHED_DESC',
  'RELEASE_DESC',
  'RELEASE_ASC',
  'RATING_DESC',
  'PLAYS_1D',
  'PLAYS_7D',
  'PLAYS_ALL',
  'LATEST_EPISODE',
  'EXPIRING_SOON',
  'MANUAL',
] as const;
export type HomeSort = (typeof HOME_SORTS)[number];

export type HomeTitleType = 'movie' | 'series';

export interface SectionRules {
  types?: HomeTitleType[];
  formats?: ContentFormat[];
  /** Genre or subgenre slugs; a parent matches its subgenres. */
  genresAny?: string[];
  tagsAny?: string[];
  collectionsAny?: string[];
  industriesAny?: string[];
  audiencesAny?: Audience[];
  accessAny?: AccessType[];
  minRuntimeMinutes?: number;
  maxRuntimeMinutes?: number;
  /** Effective release date in [now - N days, now]. */
  releasedWithinDays?: number;
  /** Effective published-at in [now - N days, now]. */
  publishedWithinDays?: number;
  releaseYearMin?: number;
  releaseYearMax?: number;
  premiere?: boolean;
  /** true: ONLY titles not yet out; false: only titles already out. */
  upcoming?: boolean;
  /** `availableUntil` within the next N days. */
  expiringWithinDays?: number;
  seriesComplete?: boolean;
  /** Series with an episode (with video) created in the last N days. */
  hasEpisodeWithinDays?: number;
  minPlays1d?: number;
  minPlays7d?: number;
  minPlaysAll?: number;
  /** At least one branch must match (ANDed with the other keys). */
  anyOf?: SectionRules[];
}

/** One title's effective values, as the engine sees it. */
export interface HomeCandidate {
  id: string;
  type: HomeTitleType;
  published: boolean;
  /** Effective format (`contentFormat ?? derived from type`). */
  format: ContentFormat;
  /** Genre and subgenre slugs the title is tagged with. */
  genres: string[];
  tags: string[];
  collections: string[];
  industries: string[];
  audience: Audience | null;
  /** Effective access (`accessType ?? derived from price`). */
  access: AccessType;
  /** Effective runtime; null for series or when unknown. */
  runtimeMinutes: number | null;
  /** Effective release date (`releaseDate ?? <year>-01-01`). */
  releaseDate: Date;
  /** Effective published-at (`publishedAt ?? updatedAt`). */
  publishedAt: Date;
  isPremiere: boolean;
  premiereStartAt: Date | null;
  availableFrom: Date | null;
  availableUntil: Date | null;
  seriesComplete: boolean;
  /** Newest episode-with-video `createdAt` (series only). */
  latestEpisodeAt: Date | null;
  /** Movie has a video, or series has at least one episode with a video. */
  playable: boolean;
  popularity: number;
  rating: number;
  plays1d: number;
  plays7d: number;
  playsAll: number;
  /** Manual order per collection slug (HomeSort.MANUAL). */
  collectionPositions: Record<string, { position: number; addedAt: Date }>;
}

/** The parts of a `HomepageSection` the engine needs. */
export interface SectionSpec {
  rules: SectionRules;
  sort: HomeSort;
  limit: number;
  pinnedTitleIds: string[];
  excludedTitleIds: string[];
}

/** Subgenre slug → parent genre slug. */
export type GenreParents = ReadonlyMap<string, string>;

const DAY_MS = 86_400_000;

// ── Parsing ──────────────────────────────────────────────────────────────────

type KeyKind =
  | { kind: 'enumList'; values: readonly string[] }
  | { kind: 'slugList' }
  | { kind: 'number'; integer?: boolean }
  | { kind: 'boolean' }
  | { kind: 'anyOf' };

const RULE_KEYS: Record<keyof SectionRules, KeyKind> = {
  types: { kind: 'enumList', values: ['movie', 'series'] },
  formats: { kind: 'enumList', values: CONTENT_FORMATS },
  genresAny: { kind: 'slugList' },
  tagsAny: { kind: 'slugList' },
  collectionsAny: { kind: 'slugList' },
  industriesAny: { kind: 'slugList' },
  audiencesAny: { kind: 'enumList', values: AUDIENCES },
  accessAny: { kind: 'enumList', values: ACCESS_TYPES },
  minRuntimeMinutes: { kind: 'number' },
  maxRuntimeMinutes: { kind: 'number' },
  releasedWithinDays: { kind: 'number' },
  publishedWithinDays: { kind: 'number' },
  releaseYearMin: { kind: 'number', integer: true },
  releaseYearMax: { kind: 'number', integer: true },
  premiere: { kind: 'boolean' },
  upcoming: { kind: 'boolean' },
  expiringWithinDays: { kind: 'number' },
  seriesComplete: { kind: 'boolean' },
  hasEpisodeWithinDays: { kind: 'number' },
  minPlays1d: { kind: 'number' },
  minPlays7d: { kind: 'number' },
  minPlaysAll: { kind: 'number' },
  anyOf: { kind: 'anyOf' },
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate `HomepageSection.rules` JSON. Throws an `Error` naming the offending
 * path on unknown keys or wrong types; returns a fresh, typed copy.
 */
export function parseSectionRules(json: unknown): SectionRules {
  return parseAt(json, 'rules');
}

function parseAt(json: unknown, path: string): SectionRules {
  if (!isPlainObject(json)) throw new Error(`${path} must be an object`);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(json)) {
    const spec = (RULE_KEYS as Record<string, KeyKind | undefined>)[key];
    const at = `${path}.${key}`;
    if (!spec || !Object.prototype.hasOwnProperty.call(RULE_KEYS, key)) {
      throw new Error(`Unknown rule key "${key}" at ${path}`);
    }
    if (value === undefined) continue;
    switch (spec.kind) {
      case 'enumList': {
        if (!Array.isArray(value)) throw new Error(`${at} must be an array`);
        value.forEach((v, i) => {
          if (typeof v !== 'string' || !spec.values.includes(v)) {
            throw new Error(`${at}[${i}] must be one of ${spec.values.join(', ')}`);
          }
        });
        out[key] = [...value];
        break;
      }
      case 'slugList': {
        if (!Array.isArray(value)) throw new Error(`${at} must be an array of slugs`);
        value.forEach((v, i) => {
          if (typeof v !== 'string' || v.trim() === '') {
            throw new Error(`${at}[${i}] must be a non-empty string`);
          }
        });
        out[key] = [...value];
        break;
      }
      case 'number': {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          throw new Error(`${at} must be a non-negative number`);
        }
        if (spec.integer && !Number.isInteger(value)) {
          throw new Error(`${at} must be an integer`);
        }
        out[key] = value;
        break;
      }
      case 'boolean': {
        if (typeof value !== 'boolean') throw new Error(`${at} must be true or false`);
        out[key] = value;
        break;
      }
      case 'anyOf': {
        if (!Array.isArray(value)) throw new Error(`${at} must be an array of rule objects`);
        out[key] = value.map((branch, i) => parseAt(branch, `${at}[${i}]`));
        break;
      }
    }
  }
  return out as SectionRules;
}

// ── Eligibility & matching ───────────────────────────────────────────────────

/** True when `rules` (or any `anyOf` branch, recursively) has `upcoming: true`. */
export function isUpcomingSection(rules: SectionRules): boolean {
  return rules.upcoming === true || (rules.anyOf ?? []).some(isUpcomingSection);
}

/** Not out yet: release date, premiere start or rights start in the future. */
export function isUpcoming(c: HomeCandidate, now: Date): boolean {
  const t = now.getTime();
  return (
    c.releaseDate.getTime() > t ||
    (c.premiereStartAt !== null && c.premiereStartAt.getTime() > t) ||
    (c.availableFrom !== null && c.availableFrom.getTime() > t)
  );
}

/**
 * Base eligibility for every RULE section. Returns null when eligible,
 * otherwise a human-readable reason. With `upcoming` (sections whose rules ask
 * for `upcoming: true`) the "out now" and playable checks are skipped: only
 * PUBLISHED and "not yet expired" are required.
 */
export function baseEligibility(c: HomeCandidate, now: Date, upcoming = false): string | null {
  if (!c.published) return 'Not published';
  const t = now.getTime();
  const expired = c.availableUntil !== null && c.availableUntil.getTime() <= t;
  const notYet = c.availableFrom !== null && c.availableFrom.getTime() > t;
  if (expired || (!upcoming && notYet)) return 'Outside its availability window';
  if (!upcoming && !c.playable) return 'No video yet';
  return null;
}

function within(date: Date | null, now: Date, days: number, direction: 'past' | 'future') {
  if (!date) return false;
  const t = date.getTime();
  const n = now.getTime();
  return direction === 'past' ? t <= n && t >= n - days * DAY_MS : t > n && t <= n + days * DAY_MS;
}

function anyIn(values: readonly string[], wanted: readonly string[]): boolean {
  return wanted.some((w) => values.includes(w));
}

function genreMatches(c: HomeCandidate, wanted: readonly string[], parents: GenreParents) {
  return c.genres.some((g) => {
    if (wanted.includes(g)) return true;
    const parent = parents.get(g);
    return parent !== undefined && wanted.includes(parent);
  });
}

/** Whether `c` satisfies `rules` (base eligibility is NOT checked here). */
export function matchesRules(
  c: HomeCandidate,
  rules: SectionRules,
  now: Date,
  genreParents: GenreParents,
): boolean {
  if (rules.types && !rules.types.includes(c.type)) return false;
  if (rules.formats && !rules.formats.includes(c.format)) return false;
  if (rules.genresAny && !genreMatches(c, rules.genresAny, genreParents)) return false;
  if (rules.tagsAny && !anyIn(c.tags, rules.tagsAny)) return false;
  if (rules.collectionsAny && !anyIn(c.collections, rules.collectionsAny)) return false;
  if (rules.industriesAny && !anyIn(c.industries, rules.industriesAny)) return false;
  if (rules.audiencesAny && (c.audience === null || !rules.audiencesAny.includes(c.audience))) {
    return false;
  }
  if (rules.accessAny && !rules.accessAny.includes(c.access)) return false;
  if (rules.minRuntimeMinutes !== undefined) {
    if (c.runtimeMinutes === null || c.runtimeMinutes < rules.minRuntimeMinutes) return false;
  }
  if (rules.maxRuntimeMinutes !== undefined) {
    if (c.runtimeMinutes === null || c.runtimeMinutes > rules.maxRuntimeMinutes) return false;
  }
  if (
    rules.releasedWithinDays !== undefined &&
    !within(c.releaseDate, now, rules.releasedWithinDays, 'past')
  ) {
    return false;
  }
  if (
    rules.publishedWithinDays !== undefined &&
    !within(c.publishedAt, now, rules.publishedWithinDays, 'past')
  ) {
    return false;
  }
  const year = c.releaseDate.getUTCFullYear();
  if (rules.releaseYearMin !== undefined && year < rules.releaseYearMin) return false;
  if (rules.releaseYearMax !== undefined && year > rules.releaseYearMax) return false;
  if (rules.premiere !== undefined && c.isPremiere !== rules.premiere) return false;
  if (rules.upcoming !== undefined && isUpcoming(c, now) !== rules.upcoming) return false;
  if (
    rules.expiringWithinDays !== undefined &&
    !within(c.availableUntil, now, rules.expiringWithinDays, 'future')
  ) {
    return false;
  }
  if (rules.seriesComplete !== undefined) {
    const complete = c.type === 'series' && c.seriesComplete;
    if (complete !== rules.seriesComplete) return false;
  }
  if (rules.hasEpisodeWithinDays !== undefined) {
    if (c.type !== 'series') return false;
    if (!within(c.latestEpisodeAt, now, rules.hasEpisodeWithinDays, 'past')) return false;
  }
  if (rules.minPlays1d !== undefined && c.plays1d < rules.minPlays1d) return false;
  if (rules.minPlays7d !== undefined && c.plays7d < rules.minPlays7d) return false;
  if (rules.minPlaysAll !== undefined && c.playsAll < rules.minPlaysAll) return false;
  if (rules.anyOf && !rules.anyOf.some((b) => matchesRules(c, b, now, genreParents))) {
    return false;
  }
  return true;
}

// ── Sorting & section building ───────────────────────────────────────────────

type Compare = (a: HomeCandidate, b: HomeCandidate) => number;

const byId: Compare = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const desc =
  (f: (c: HomeCandidate) => number): Compare =>
  (a, b) =>
    f(b) - f(a);
const asc =
  (f: (c: HomeCandidate) => number): Compare =>
  (a, b) =>
    f(a) - f(b);
/** Ascending with nulls (mapped to null) last. */
const ascNullsLast =
  (f: (c: HomeCandidate) => number | null): Compare =>
  (a, b) => {
    const x = f(a);
    const y = f(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  };
const descNullsLast = (f: (c: HomeCandidate) => number | null): Compare => {
  const inner = ascNullsLast((c) => {
    const v = f(c);
    return v === null ? null : -v;
  });
  return inner;
};
const chain =
  (...cmps: Compare[]): Compare =>
  (a, b) => {
    for (const cmp of cmps) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  };

/** First `collectionsAny` slug in the rules (depth-first through `anyOf`). */
export function manualCollection(rules: SectionRules): string | null {
  if (rules.collectionsAny && rules.collectionsAny.length > 0) return rules.collectionsAny[0]!;
  for (const branch of rules.anyOf ?? []) {
    const found = manualCollection(branch);
    if (found) return found;
  }
  return null;
}

/** Comparator for a sort, always ending with the title-id tiebreak. */
export function comparatorFor(sort: HomeSort, rules: SectionRules): Compare {
  const popularity = chain(
    desc((c) => c.popularity),
    desc((c) => c.playsAll),
  );
  const time = (d: Date | null) => (d ? d.getTime() : null);
  switch (sort) {
    case 'POPULARITY':
      return chain(popularity, byId);
    case 'PUBLISHED_DESC':
      return chain(
        desc((c) => c.publishedAt.getTime()),
        byId,
      );
    case 'RELEASE_DESC':
      return chain(
        desc((c) => c.releaseDate.getTime()),
        byId,
      );
    case 'RELEASE_ASC':
      return chain(
        asc((c) => c.releaseDate.getTime()),
        byId,
      );
    case 'RATING_DESC':
      return chain(
        desc((c) => c.rating),
        byId,
      );
    case 'PLAYS_1D':
      return chain(
        desc((c) => c.plays1d),
        desc((c) => c.popularity),
        byId,
      );
    case 'PLAYS_7D':
      return chain(
        desc((c) => c.plays7d),
        desc((c) => c.popularity),
        byId,
      );
    case 'PLAYS_ALL':
      return chain(
        desc((c) => c.playsAll),
        desc((c) => c.popularity),
        byId,
      );
    case 'LATEST_EPISODE':
      return chain(
        descNullsLast((c) => time(c.latestEpisodeAt)),
        byId,
      );
    case 'EXPIRING_SOON':
      return chain(
        ascNullsLast((c) => time(c.availableUntil)),
        byId,
      );
    case 'MANUAL': {
      const slug = manualCollection(rules);
      const entry = (c: HomeCandidate) => (slug ? c.collectionPositions[slug] : undefined);
      return chain(
        ascNullsLast((c) => entry(c)?.position ?? null),
        ascNullsLast((c) => entry(c)?.addedAt.getTime() ?? null),
        byId,
      );
    }
    default:
      return byId;
  }
}

/**
 * Compute one RULE section: base eligibility + rules, minus excluded ids;
 * pinned ids (when base-eligible and not excluded) lead in pinned order —
 * they need not match the rules — then the rest by `sort`, then `limit`.
 * `eligibleCount` is the row size after pins/excludes, before `limit`.
 */
export function buildSection(
  section: SectionSpec,
  candidates: readonly HomeCandidate[],
  now: Date,
  genreParents: GenreParents,
): { items: HomeCandidate[]; eligibleCount: number } {
  const upcoming = isUpcomingSection(section.rules);
  const excluded = new Set(section.excludedTitleIds);
  const byIdMap = new Map(candidates.map((c) => [c.id, c]));
  const ok = (c: HomeCandidate) =>
    !excluded.has(c.id) && baseEligibility(c, now, upcoming) === null;

  const pinned: HomeCandidate[] = [];
  const pinnedIds = new Set<string>();
  for (const id of section.pinnedTitleIds) {
    const c = byIdMap.get(id);
    if (!c || pinnedIds.has(id) || !ok(c)) continue;
    pinned.push(c);
    pinnedIds.add(id);
  }

  const rest = candidates
    .filter(
      (c) => !pinnedIds.has(c.id) && ok(c) && matchesRules(c, section.rules, now, genreParents),
    )
    .sort(comparatorFor(section.sort, section.rules));

  const all = [...pinned, ...rest];
  return { items: all.slice(0, Math.max(0, section.limit)), eligibleCount: all.length };
}
