/**
 * Pure helpers for the Classification panel and the Homepage screen. No DOM,
 * no client, no React: everything here is unit-tested from
 * tests/classification.test.mjs.
 */
import type {
  AccessType,
  Audience,
  ClassificationDto,
  ClassificationInput,
  ContentFormat,
  HomeSectionKind,
  HomeSort,
  SectionRules,
  TagKind,
  TaxonomyGenre,
  TaxonomyTag,
} from './types';

// ── Slugs ───────────────────────────────────────────────────────────────────

/** "Faith & Spirituality" → "faith-spirituality" (spec: lower-case, `&` dropped). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Subgenre slug = `<parent slug>-<subgenre slug>`. */
export function subgenreSlug(parentSlug: string, name: string): string {
  return `${parentSlug}-${slugify(name)}`;
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ── Genres ──────────────────────────────────────────────────────────────────

/** slug → parent slug (top-level genres map to themselves). */
export function genreParentMap(genres: TaxonomyGenre[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of genres) {
    map.set(g.slug, g.slug);
    for (const s of g.subgenres) map.set(s.slug, g.slug);
  }
  return map;
}

/** slug → display name ("Horror › Psychological" for subgenres). */
export function genreLabelMap(genres: TaxonomyGenre[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of genres) {
    map.set(g.slug, g.name);
    for (const s of g.subgenres) map.set(s.slug, `${g.name} › ${s.name}`);
  }
  return map;
}

/**
 * What the server mirrors into the legacy `genres` column: names of the
 * selected top-level genres (a subgenre contributes its parent's name),
 * deduplicated, in selection order.
 */
export function legacyGenreNames(selected: string[], genres: TaxonomyGenre[]): string[] {
  const parents = genreParentMap(genres);
  const names = new Map(genres.map((g) => [g.slug, g.name]));
  const out: string[] = [];
  for (const slug of selected) {
    const parent = parents.get(slug);
    const name = parent ? names.get(parent) : undefined;
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export interface GenreGroup {
  slug: string;
  name: string;
  /** True when the parent itself matches the query (or there is no query). */
  parentMatch: boolean;
  subgenres: { slug: string; name: string }[];
}

/**
 * Filter genres for the searchable picker. A parent that matches keeps all
 * its subgenres; otherwise only matching subgenres are kept and parents with
 * none are dropped. Order follows the taxonomy.
 */
export function groupGenres(genres: TaxonomyGenre[], query: string): GenreGroup[] {
  const q = query.trim().toLowerCase();
  const out: GenreGroup[] = [];
  for (const g of genres) {
    if (!q) {
      out.push({ slug: g.slug, name: g.name, parentMatch: true, subgenres: g.subgenres });
      continue;
    }
    const parentMatch = g.name.toLowerCase().includes(q) || g.slug.includes(q);
    const subs = parentMatch
      ? g.subgenres
      : g.subgenres.filter((s) => s.name.toLowerCase().includes(q) || s.slug.includes(q));
    if (parentMatch || subs.length > 0) {
      out.push({ slug: g.slug, name: g.name, parentMatch, subgenres: subs });
    }
  }
  return out;
}

// ── Tags ────────────────────────────────────────────────────────────────────

export const TAG_KINDS: TagKind[] = ['MOOD', 'THEME', 'SETTING', 'CHARACTER', 'STORY'];
export const TAG_KIND_LABELS: Record<TagKind, string> = {
  MOOD: 'Mood',
  THEME: 'Theme',
  SETTING: 'Setting',
  CHARACTER: 'Character',
  STORY: 'Story',
};

/** Tags grouped by kind in the canonical kind order; empty kinds omitted. */
export function groupTags(tags: TaxonomyTag[]): { kind: TagKind; tags: TaxonomyTag[] }[] {
  return TAG_KINDS.map((kind) => ({ kind, tags: tags.filter((t) => t.kind === kind) })).filter(
    (g) => g.tags.length > 0,
  );
}

// ── Country / language codes ────────────────────────────────────────────────

/** ISO 3166-1 alpha-2, upper-cased; null when invalid. */
export function normalizeCountryCode(raw: string): string | null {
  const v = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

/** 2–3 letter lower-case language code; null when invalid. */
export function normalizeLanguageCode(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return /^[a-z]{2,3}$/.test(v) ? v : null;
}

/**
 * Split free text ("ng, gh us") into normalised codes. Duplicates (and codes
 * already in `existing`) are dropped; anything invalid is reported back.
 */
export function parseCodes(
  input: string,
  kind: 'country' | 'language',
  existing: string[] = [],
): { codes: string[]; invalid: string[] } {
  const norm = kind === 'country' ? normalizeCountryCode : normalizeLanguageCode;
  const codes: string[] = [];
  const invalid: string[] = [];
  for (const part of input.split(/[\s,;]+/)) {
    if (!part) continue;
    const c = norm(part);
    if (!c) invalid.push(part);
    else if (!codes.includes(c) && !existing.includes(c)) codes.push(c);
  }
  return { codes, invalid };
}

// ── Industries (mirror of the backend's pure deriveIndustries) ─────────────

export interface IndustryRule {
  slug: string;
  name: string;
  countries: string[];
  languages: string[];
}

/**
 * An industry matches when (countries empty or contains one of the title's
 * countries) AND (languages empty or contains one of the original languages),
 * with at least one list non-empty. `international-cinema` is added only when
 * the title has countries/languages and nothing else matched.
 */
export function deriveIndustries(
  countries: string[],
  languages: string[],
  industries: IndustryRule[],
): string[] {
  const cs = countries.map((c) => c.toUpperCase());
  const ls = languages.map((l) => l.toLowerCase());
  const out: string[] = [];
  for (const ind of industries) {
    if (ind.slug === 'international-cinema') continue;
    if (ind.countries.length === 0 && ind.languages.length === 0) continue;
    const cOk = ind.countries.length === 0 || ind.countries.some((c) => cs.includes(c));
    const lOk = ind.languages.length === 0 || ind.languages.some((l) => ls.includes(l));
    if (cOk && lOk) out.push(ind.slug);
  }
  if (out.length === 0 && (cs.length > 0 || ls.length > 0)) {
    if (industries.some((i) => i.slug === 'international-cinema')) out.push('international-cinema');
  }
  return out;
}

// ── Dates ───────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO timestamp → `<input type="datetime-local">` value in local time. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value → ISO timestamp (null when empty/invalid). */
export function localInputToIso(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isValidDateOnly(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ── Draft ↔ DTO ─────────────────────────────────────────────────────────────

/** Form state of the Classification panel. Text fields are '' for "unset". */
export interface ClassificationDraft {
  contentFormat: ContentFormat | '';
  genres: string[];
  tags: string[];
  collections: string[];
  /** MANUAL industries only. */
  industries: string[];
  audience: Audience | '';
  ageRating: string;
  ratingJurisdiction: string;
  releaseDate: string;
  accessType: AccessType | '';
  productionCountries: string[];
  originalLanguages: string[];
  audioLanguages: string[];
  /** datetime-local values */
  availableFrom: string;
  availableUntil: string;
  seriesComplete: boolean;
}

export function draftFromDto(dto: ClassificationDto): ClassificationDraft {
  return {
    contentFormat: dto.contentFormat ?? '',
    genres: [...dto.genres],
    tags: [...dto.tags],
    collections: [...dto.collections],
    industries: dto.industries.filter((i) => i.source === 'manual').map((i) => i.slug),
    audience: dto.audience ?? '',
    ageRating: dto.ageRating ?? '',
    ratingJurisdiction: dto.ratingJurisdiction ?? '',
    releaseDate: dto.releaseDate ? dto.releaseDate.slice(0, 10) : '',
    accessType: dto.accessType ?? '',
    productionCountries: [...dto.productionCountries],
    originalLanguages: [...dto.originalLanguages],
    audioLanguages: [...dto.audioLanguages],
    availableFrom: isoToLocalInput(dto.availableFrom),
    availableUntil: isoToLocalInput(dto.availableUntil),
    seriesComplete: dto.seriesComplete,
  };
}

const sameOrdered = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));
const textOrNull = (v: string) => (v.trim() === '' ? null : v.trim());

/**
 * Only the fields that differ from what the server returned. Genre order is
 * meaningful (the server keeps selection order); other lists compare as sets.
 */
export function diffClassification(
  base: ClassificationDto,
  draft: ClassificationDraft,
): ClassificationInput {
  const prev = draftFromDto(base);
  const out: ClassificationInput = {};
  if (draft.contentFormat !== prev.contentFormat) out.contentFormat = draft.contentFormat || null;
  if (!sameOrdered(draft.genres, prev.genres)) out.genres = [...draft.genres];
  if (!sameSet(draft.tags, prev.tags)) out.tags = [...draft.tags];
  if (!sameSet(draft.collections, prev.collections)) out.collections = [...draft.collections];
  if (!sameSet(draft.industries, prev.industries)) out.industries = [...draft.industries];
  if (draft.audience !== prev.audience) out.audience = draft.audience || null;
  if (textOrNull(draft.ageRating) !== textOrNull(prev.ageRating))
    out.ageRating = textOrNull(draft.ageRating);
  if (textOrNull(draft.ratingJurisdiction) !== textOrNull(prev.ratingJurisdiction))
    out.ratingJurisdiction = textOrNull(draft.ratingJurisdiction);
  if (draft.releaseDate !== prev.releaseDate) out.releaseDate = draft.releaseDate || null;
  if (draft.accessType !== prev.accessType) out.accessType = draft.accessType || null;
  if (!sameSet(draft.productionCountries, prev.productionCountries))
    out.productionCountries = [...draft.productionCountries];
  if (!sameSet(draft.originalLanguages, prev.originalLanguages))
    out.originalLanguages = [...draft.originalLanguages];
  if (!sameSet(draft.audioLanguages, prev.audioLanguages))
    out.audioLanguages = [...draft.audioLanguages];
  if (draft.availableFrom !== prev.availableFrom)
    out.availableFrom = localInputToIso(draft.availableFrom);
  if (draft.availableUntil !== prev.availableUntil)
    out.availableUntil = localInputToIso(draft.availableUntil);
  if (base.type === 'series' && draft.seriesComplete !== prev.seriesComplete)
    out.seriesComplete = draft.seriesComplete;
  return out;
}

export function hasChanges(input: ClassificationInput): boolean {
  return Object.keys(input).length > 0;
}

/** Client-side checks that mirror the server's 400s; null = OK. */
export function validateDraft(draft: ClassificationDraft): string | null {
  if (draft.releaseDate && !isValidDateOnly(draft.releaseDate))
    return 'Release date must be a valid YYYY-MM-DD date';
  const bad = draft.productionCountries.filter((c) => normalizeCountryCode(c) !== c);
  if (bad.length) return `Invalid country codes: ${bad.join(', ')}`;
  const badLang = [...draft.originalLanguages, ...draft.audioLanguages].filter(
    (l) => normalizeLanguageCode(l) !== l,
  );
  if (badLang.length) return `Invalid language codes: ${badLang.join(', ')}`;
  if (draft.availableFrom && !localInputToIso(draft.availableFrom))
    return 'Available from is not a valid date';
  if (draft.availableUntil && !localInputToIso(draft.availableUntil))
    return 'Available until is not a valid date';
  if (draft.availableFrom && draft.availableUntil) {
    const from = new Date(draft.availableFrom).getTime();
    const until = new Date(draft.availableUntil).getTime();
    if (until <= from) return 'Available until must be after available from';
  }
  return null;
}

// ── Small list helpers ──────────────────────────────────────────────────────

/** Add when missing, remove when present (keeps the order of the rest). */
export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Move the item at `index` by `delta`; out-of-range moves return a copy unchanged. */
export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const next = [...list];
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);
  return next;
}

// ── Effective values ────────────────────────────────────────────────────────

export function effectiveFormat(
  type: 'movie' | 'series',
  contentFormat: ContentFormat | null | '',
): ContentFormat {
  return contentFormat || (type === 'series' ? 'TV_SERIES' : 'FEATURE_FILM');
}

export function effectiveAccess(accessType: AccessType | null | '', priceMinor: number): AccessType {
  return accessType || (priceMinor === 0 ? 'FREE' : 'PAY_PER_VIEW');
}

// ── Homepage sections ───────────────────────────────────────────────────────

export const PERSONAL_KINDS: HomeSectionKind[] = [
  'CONTINUE_WATCHING',
  'WATCHLIST',
  'RECOMMENDED',
  'BECAUSE_YOU_WATCHED',
];

export function isPersonalKind(kind: HomeSectionKind): boolean {
  return kind !== 'RULE';
}

export const SORT_LABELS: Record<HomeSort, string> = {
  POPULARITY: 'Popularity',
  PUBLISHED_DESC: 'Newest published',
  RELEASE_DESC: 'Newest release',
  RELEASE_ASC: 'Soonest / oldest release',
  RATING_DESC: 'Highest rated',
  PLAYS_1D: 'Plays today',
  PLAYS_7D: 'Plays this week',
  PLAYS_ALL: 'All-time plays',
  LATEST_EPISODE: 'Latest episode',
  EXPIRING_SOON: 'Expiring soon',
  MANUAL: 'Manual (collection order)',
};

export const KIND_LABELS: Record<HomeSectionKind, string> = {
  RULE: 'Rule',
  CONTINUE_WATCHING: 'Continue watching',
  WATCHLIST: 'Watchlist',
  RECOMMENDED: 'Recommended',
  BECAUSE_YOU_WATCHED: 'Because you watched',
};

/** One-line human summary of section rules, e.g. "genres: action · types: movie". */
export function summarizeRules(rules: SectionRules): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(rules) as [keyof SectionRules, unknown][]) {
    if (value === undefined) continue;
    if (key === 'anyOf' && Array.isArray(value)) {
      const branches = (value as SectionRules[]).map((b) => summarizeRules(b) || 'anything');
      parts.push(`any of (${branches.join(' | ')})`);
    } else if (Array.isArray(value)) {
      parts.push(`${key.replace(/Any$/, '')}: ${value.join(', ')}`);
    } else {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.join(' · ');
}

/** Case-insensitive title search over existing titles, excluding ids already used. */
export function searchTitles<T extends { id: string; title: string }>(
  titles: T[],
  query: string,
  excludeIds: string[] = [],
  max = 8,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return titles
    .filter((t) => !excludeIds.includes(t.id) && t.title.toLowerCase().includes(q))
    .slice(0, max);
}

// ── Section rules: validation (mirror of the backend's parseSectionRules) ───
// Source of truth: apps/backend/src/modules/catalogue/home/section-rules.ts.
// Keys, their kinds, their order and the error messages are copied from it so
// the editor shows the same message the server's 400 would carry.

export const HOME_SORTS: HomeSort[] = [
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
];

export const TITLE_TYPES = ['movie', 'series'] as const;
export type TitleType = (typeof TITLE_TYPES)[number];

export const CONTENT_FORMAT_VALUES: ContentFormat[] = [
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
];
export const AUDIENCE_VALUES: Audience[] = ['KIDS', 'TEENS', 'FAMILY', 'ADULTS'];
export const ACCESS_TYPE_VALUES: AccessType[] = [
  'FREE',
  'SUBSCRIPTION',
  'PAY_PER_VIEW',
  'RENTAL',
  'PURCHASE',
  'PROMOTIONAL',
];

export type RuleKeyKind =
  | { kind: 'enumList'; values: readonly string[] }
  | { kind: 'slugList' }
  | { kind: 'number'; integer?: boolean }
  | { kind: 'boolean' }
  | { kind: 'anyOf' };

/** Every accepted rule key, in the backend's order (also the canonical JSON order). */
export const RULE_KEY_KINDS: Record<keyof SectionRules, RuleKeyKind> = {
  types: { kind: 'enumList', values: TITLE_TYPES },
  formats: { kind: 'enumList', values: CONTENT_FORMAT_VALUES },
  genresAny: { kind: 'slugList' },
  tagsAny: { kind: 'slugList' },
  collectionsAny: { kind: 'slugList' },
  industriesAny: { kind: 'slugList' },
  audiencesAny: { kind: 'enumList', values: AUDIENCE_VALUES },
  accessAny: { kind: 'enumList', values: ACCESS_TYPE_VALUES },
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

export const SECTION_RULE_KEYS = Object.keys(RULE_KEY_KINDS) as (keyof SectionRules)[];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const hasRuleKey = (key: string): key is keyof SectionRules =>
  Object.prototype.hasOwnProperty.call(RULE_KEY_KINDS, key);

/** Validate one non-anyOf value; returns a copy or throws the server's message. */
function checkRuleValue(spec: RuleKeyKind, value: unknown, at: string): unknown {
  switch (spec.kind) {
    case 'enumList': {
      if (!Array.isArray(value)) throw new Error(`${at} must be an array`);
      value.forEach((v, i) => {
        if (typeof v !== 'string' || !spec.values.includes(v)) {
          throw new Error(`${at}[${i}] must be one of ${spec.values.join(', ')}`);
        }
      });
      return [...value];
    }
    case 'slugList': {
      if (!Array.isArray(value)) throw new Error(`${at} must be an array of slugs`);
      value.forEach((v, i) => {
        if (typeof v !== 'string' || v.trim() === '') {
          throw new Error(`${at}[${i}] must be a non-empty string`);
        }
      });
      return [...value];
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`${at} must be a non-negative number`);
      }
      if (spec.integer && !Number.isInteger(value)) throw new Error(`${at} must be an integer`);
      return value;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') throw new Error(`${at} must be true or false`);
      return value;
    }
    case 'anyOf':
      throw new Error(`${at} is not a plain value`);
  }
}

function parseRulesAt(json: unknown, path: string): SectionRules {
  if (!isPlainObject(json)) throw new Error(`${path} must be an object`);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(json)) {
    const at = `${path}.${key}`;
    if (!hasRuleKey(key)) throw new Error(`Unknown rule key "${key}" at ${path}`);
    if (value === undefined) continue;
    const spec = RULE_KEY_KINDS[key];
    if (spec.kind === 'anyOf') {
      if (!Array.isArray(value)) throw new Error(`${at} must be an array of rule objects`);
      out[key] = value.map((branch, i) => parseRulesAt(branch, `${at}[${i}]`));
    } else {
      out[key] = checkRuleValue(spec, value, at);
    }
  }
  return out as SectionRules;
}

/**
 * Same contract as the backend: throws an `Error` naming the offending path on
 * unknown keys or wrong types; returns a fresh, typed copy.
 */
export function parseSectionRules(json: unknown): SectionRules {
  return parseRulesAt(json, 'rules');
}

/** parseSectionRules without the throw: null = valid, otherwise the message. */
export function sectionRulesError(json: unknown): string | null {
  try {
    parseSectionRules(json);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export type RulesJsonResult = { ok: true; rules: SectionRules } | { ok: false; error: string };

/** Text of the Advanced (JSON) tab → validated rules, or the first problem. */
export function parseRulesJson(text: string): RulesJsonResult {
  if (!text.trim()) return { ok: false, error: 'Enter a JSON object — {} matches every title' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    return { ok: true, rules: parseSectionRules(json) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Keys in the canonical order (recursively); unknown keys, if any, go last. */
export function canonicalRules(rules: SectionRules): SectionRules {
  const src = rules as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of SECTION_RULE_KEYS) {
    const v = src[key];
    if (v === undefined) continue;
    out[key] =
      key === 'anyOf' && Array.isArray(v)
        ? v.map((b) => (isPlainObject(b) ? canonicalRules(b as SectionRules) : b))
        : v;
  }
  for (const [key, v] of Object.entries(src)) if (!hasRuleKey(key) && v !== undefined) out[key] = v;
  return out as SectionRules;
}

export const rulesToJson = (rules: SectionRules): string =>
  JSON.stringify(canonicalRules(rules), null, 2);

export const sameRules = (a: SectionRules, b: SectionRules): boolean =>
  JSON.stringify(canonicalRules(a)) === JSON.stringify(canonicalRules(b));

/** HomeSort.MANUAL orders by the first `collectionsAny` slug (depth-first through anyOf). */
export function manualCollection(rules: SectionRules): string | null {
  if (rules.collectionsAny && rules.collectionsAny.length > 0) return rules.collectionsAny[0]!;
  for (const branch of rules.anyOf ?? []) {
    const found = manualCollection(branch);
    if (found) return found;
  }
  return null;
}

// ── Section rules: form model ───────────────────────────────────────────────

/** Tri-state for boolean rule keys; 'any' omits the key. */
export type TriState = 'any' | 'yes' | 'no';

export const RULE_LIST_KEYS = [
  'types',
  'formats',
  'genresAny',
  'tagsAny',
  'collectionsAny',
  'industriesAny',
  'audiencesAny',
  'accessAny',
] as const;
export type RuleListKey = (typeof RULE_LIST_KEYS)[number];

export const RULE_NUMBER_KEYS = [
  'minRuntimeMinutes',
  'maxRuntimeMinutes',
  'releasedWithinDays',
  'publishedWithinDays',
  'releaseYearMin',
  'releaseYearMax',
  'expiringWithinDays',
  'hasEpisodeWithinDays',
  'minPlays1d',
  'minPlays7d',
  'minPlaysAll',
] as const;
export type RuleNumberKey = (typeof RULE_NUMBER_KEYS)[number];

export const RULE_FLAG_KEYS = ['premiere', 'upcoming', 'seriesComplete'] as const;
export type RuleFlagKey = (typeof RULE_FLAG_KEYS)[number];

/**
 * One rule object as form state: lists ([] = key omitted), numbers as the
 * text typed ('' = omitted) and booleans as tri-states ('any' = omitted).
 */
export type RulesForm = { [K in RuleListKey]: NonNullable<SectionRules[K]> } & {
  [K in RuleNumberKey]: string;
} & { [K in RuleFlagKey]: TriState };

/** Top-level form: the rule keys plus one level of `anyOf` branches ([] = omitted). */
export interface RulesDraft extends RulesForm {
  anyOf: RulesForm[];
}

export const RULE_FIELD_LABELS: Record<keyof SectionRules, string> = {
  types: 'Title types',
  formats: 'Formats',
  genresAny: 'Genres',
  tagsAny: 'Tags',
  collectionsAny: 'Collections',
  industriesAny: 'Industries',
  audiencesAny: 'Audiences',
  accessAny: 'Access types',
  minRuntimeMinutes: 'Min runtime (minutes)',
  maxRuntimeMinutes: 'Max runtime (minutes)',
  releasedWithinDays: 'Released within (days)',
  publishedWithinDays: 'Published within (days)',
  releaseYearMin: 'Release year from',
  releaseYearMax: 'Release year to',
  premiere: 'Premiere',
  upcoming: 'Upcoming',
  expiringWithinDays: 'Expiring within (days)',
  seriesComplete: 'Series complete',
  hasEpisodeWithinDays: 'New episode within (days)',
  minPlays1d: 'Min plays (today)',
  minPlays7d: 'Min plays (7 days)',
  minPlaysAll: 'Min plays (all time)',
  anyOf: 'Any of',
};

export function emptyRulesForm(): RulesForm {
  const form: Record<string, unknown> = {};
  for (const k of RULE_LIST_KEYS) form[k] = [];
  for (const k of RULE_NUMBER_KEYS) form[k] = '';
  for (const k of RULE_FLAG_KEYS) form[k] = 'any';
  return form as RulesForm;
}

export function emptyRulesDraft(): RulesDraft {
  return { ...emptyRulesForm(), anyOf: [] };
}

/** The non-anyOf keys of `rules` as form state (anyOf is ignored here). */
export function formFromRules(rules: SectionRules): RulesForm {
  const form = emptyRulesForm() as Record<string, unknown>;
  for (const k of RULE_LIST_KEYS) if (rules[k] !== undefined) form[k] = [...rules[k]!];
  for (const k of RULE_NUMBER_KEYS) if (rules[k] !== undefined) form[k] = String(rules[k]);
  for (const k of RULE_FLAG_KEYS) if (rules[k] !== undefined) form[k] = rules[k] ? 'yes' : 'no';
  return form as RulesForm;
}

export function draftFromRules(rules: SectionRules): RulesDraft {
  return { ...formFromRules(rules), anyOf: (rules.anyOf ?? []).map(formFromRules) };
}

export interface RulesFromFormResult {
  /** Only the keys that carry a value; never `undefined`/`null` inside. */
  rules: SectionRules;
  /** Rule path (e.g. `rules.anyOf[0].minPlays7d`) → the server's message. */
  errors: Record<string, string>;
}

/** Form state → rules. Invalid numbers are left out and reported in `errors`. */
export function rulesFromForm(form: RulesForm, path = 'rules'): RulesFromFormResult {
  const out: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const key of SECTION_RULE_KEYS) {
    if ((RULE_LIST_KEYS as readonly string[]).includes(key)) {
      const list = form[key as RuleListKey] as string[];
      if (list.length > 0) out[key] = [...list];
    } else if ((RULE_NUMBER_KEYS as readonly string[]).includes(key)) {
      const text = form[key as RuleNumberKey].trim();
      if (text === '') continue;
      const at = `${path}.${key}`;
      try {
        out[key] = checkRuleValue(RULE_KEY_KINDS[key], Number(text), at);
      } catch (e) {
        errors[at] = e instanceof Error ? e.message : String(e);
      }
    } else if ((RULE_FLAG_KEYS as readonly string[]).includes(key)) {
      const v = form[key as RuleFlagKey];
      if (v !== 'any') out[key] = v === 'yes';
    }
  }
  return { rules: out as SectionRules, errors };
}

export function rulesFromDraft(draft: RulesDraft): RulesFromFormResult {
  const top = rulesFromForm(draft);
  if (draft.anyOf.length === 0) return top;
  const errors = { ...top.errors };
  const anyOf = draft.anyOf.map((branch, i) => {
    const r = rulesFromForm(branch, `rules.anyOf[${i}]`);
    Object.assign(errors, r.errors);
    return r.rules;
  });
  return { rules: { ...top.rules, anyOf }, errors };
}

/**
 * Why `rules` cannot be edited in the form without changing their meaning
 * (null = it can): `anyOf` nested inside a branch, an empty `anyOf`, or an
 * empty list — the last two match nothing, while the form's "nothing chosen"
 * means "any".
 */
export function formUnsupportedReason(rules: SectionRules): string | null {
  const check = (r: SectionRules, path: string, depth: number): string | null => {
    for (const k of RULE_LIST_KEYS) {
      const list = r[k];
      if (list !== undefined && list.length === 0) {
        return `${path}.${k} is an empty list, which matches no titles`;
      }
    }
    if (r.anyOf === undefined) return null;
    if (depth > 0) return `${path}.anyOf nests branches deeper than the form supports`;
    if (r.anyOf.length === 0) return `${path}.anyOf has no branches, which matches no titles`;
    for (const [i, branch] of r.anyOf.entries()) {
      const reason = check(branch, `${path}.anyOf[${i}]`, depth + 1);
      if (reason) return reason;
    }
    return null;
  };
  return check(rules, 'rules', 0);
}
