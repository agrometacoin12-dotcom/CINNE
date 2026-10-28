/**
 * Dev/verification-only seed vocabulary and a simplified homepage rules
 * engine for MockApiClient. Mirrors docs/content-classification.md; the real
 * engine lives in apps/backend/src/modules/catalogue/home/.
 */
import { SECTION_RULE_KEYS, slugify, subgenreSlug, type IndustryRule } from './classification';
import type {
  AccessType,
  Audience,
  ContentFormat,
  HomeSectionKind,
  HomeSort,
  SectionRules,
  Taxonomy,
  TaxonomyCollection,
  TaxonomyGenre,
  TaxonomyTag,
  TitleSummary,
} from './types';

// ── Genres ──────────────────────────────────────────────────────────────────
const GENRE_SOURCE: [string, string[]][] = [
  ['Action', ['Martial Arts', 'Military', 'Gunfights', 'Superheroes']],
  ['Adventure', ['Jungle', 'Survival', 'Treasure Hunt', 'Exploration']],
  ['Comedy', ['Romantic Comedy', 'Dark Comedy', 'Satire', 'Slapstick']],
  ['Drama', ['Family Drama', 'Social Drama', 'Political Drama']],
  ['Romance', ['Romantic Drama', 'Teen Romance', 'Historical Romance']],
  ['Horror', ['Supernatural', 'Slasher', 'Psychological', 'Paranormal']],
  ['Thriller', ['Psychological', 'Conspiracy', 'Mystery', 'Survival']],
  ['Science Fiction', ['Space', 'AI', 'Time Travel', 'Cyberpunk', 'Dystopian']],
  ['Fantasy', ['Magic', 'Mythology', 'Epic Fantasy', 'Urban Fantasy']],
  ['Crime', ['Gangster', 'Detective', 'Heist', 'Organized Crime']],
  ['Mystery', ['Whodunit', 'Detective', 'Suspense', 'Unsolved Cases']],
  ['Documentary', ['Nature', 'Biography', 'Investigative', 'Historical']],
  ['Animation', ['2D', '3D', 'Anime', 'Stop Motion']],
  ['Family', ['Family Adventure', 'Family Comedy', 'Inspirational']],
  ['Musical', ['Music Drama', 'Dance', 'Broadway-style']],
  ['Biography', ['Biographical Drama', 'Biopic']],
  ['History', ['Historical Drama', 'Period Film']],
  ['War', ['Military', 'World Wars', 'Civil War']],
  ['Western', ['Classic Western', 'Neo-Western']],
  ['Sports', ['Football', 'Boxing', 'Racing', 'Basketball']],
  ['Faith & Spirituality', ['Christian', 'Islamic', 'Inspirational', 'Biblical']],
  ['Politics', ['Political Drama', 'Political Thriller']],
  ['Psychological', ['Mind Games', 'Psychological Drama']],
  ['Disaster', ['Earthquakes', 'Floods', 'Apocalyptic']],
  ['Superhero', ['Marvel-style', 'DC-style', 'Original Heroes']],
  ['Teen & Young Adult', ['Coming-of-Age', 'School', 'Teen Drama']],
  ['Educational', ['Science', 'Learning', 'Academic']],
  ['Experimental', ['Avant-Garde', 'Art House']],
  ['Film Noir', ['Classic Noir', 'Neo-Noir']],
  ['Reality & Unscripted', ['Reality Shows', 'Competitions', 'Lifestyle']],
];

export const GENRES: TaxonomyGenre[] = GENRE_SOURCE.map(([name, subs]) => {
  const slug = slugify(name);
  return { slug, name, subgenres: subs.map((s) => ({ slug: subgenreSlug(slug, s), name: s })) };
});

// ── Tags ────────────────────────────────────────────────────────────────────
const tag = (kind: TaxonomyTag['kind'], name: string, slug = slugify(name)): TaxonomyTag => ({
  slug,
  name,
  kind,
});

export const TAGS: TaxonomyTag[] = [
  ...[
    'Feel-Good', 'Emotional', 'Dark', 'Suspenseful', 'Heartwarming', 'Intense', 'Funny',
    'Romantic', 'Inspirational', 'Relaxing', 'Thought-Provoking', 'Scary', 'Uplifting', 'Gritty',
  ].map((n) => tag('MOOD', n)),
  ...[
    'Betrayal', 'Revenge', 'Family Conflict', 'Friendship', 'Marriage', 'Infidelity',
    'Redemption', 'Justice', 'Corruption', 'Wealth', 'Poverty', 'Power', 'Survival', 'Jealousy',
    'Ambition', 'Tradition', 'Spirituality', 'Parenthood', 'Coming of Age',
  ].map((n) => tag('THEME', n)),
  tag('SETTING', 'School & Campus', 'school-campus'),
  tag('SETTING', 'Village', 'village'),
  tag('SETTING', 'Royalty & Kingdoms', 'royalty'),
  tag('SETTING', 'Wedding', 'wedding'),
  tag('SETTING', 'City Life', 'city-life'),
  tag('CHARACTER', 'Strong Female Lead', 'strong-female-lead'),
  tag('STORY', 'Based on a True Story', 'true-story'),
  tag('STORY', 'True Crime', 'true-crime'),
];

// ── Industries ──────────────────────────────────────────────────────────────
const AFRICA =
  'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW'.split(' ');
const EUROPE =
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE GB NO CH IS UA RS AL BA ME MK MD BY LI MC SM AD XK'.split(' ');
const LATAM = 'MX GT BZ HN SV NI CR PA CO VE EC PE BO CL AR UY PY BR CU DO PR'.split(' ');
const MIDEAST = 'AE SA QA KW BH OM YE IQ IR IL PS JO LB SY TR EG'.split(' ');

const ind = (slug: string, name: string, countries: string[] = [], languages: string[] = []) => ({
  slug,
  name,
  countries,
  languages,
});

export const INDUSTRIES: IndustryRule[] = [
  ind('nollywood', 'Nollywood', ['NG']),
  ind('ghallywood', 'Ghallywood', ['GH']),
  ind('bollywood', 'Bollywood', ['IN'], ['hi']),
  ind('hollywood', 'Hollywood', ['US']),
  ind('kannywood', 'Kannywood', ['NG'], ['ha']),
  ind('yoruba-cinema', 'Yoruba Cinema', [], ['yo']),
  ind('igbo-cinema', 'Igbo Cinema', [], ['ig']),
  ind('south-african-cinema', 'South African Cinema', ['ZA']),
  ind('african-cinema', 'African Cinema', AFRICA),
  ind('korean-cinema', 'Korean Cinema', ['KR']),
  ind('japanese-cinema', 'Japanese Cinema', ['JP']),
  ind('chinese-cinema', 'Chinese Cinema', ['CN', 'HK', 'TW']),
  ind('european-cinema', 'European Cinema', EUROPE),
  ind('latin-american-cinema', 'Latin American Cinema', LATAM),
  ind('middle-eastern-cinema', 'Middle Eastern Cinema', MIDEAST),
  ind('international-cinema', 'International Cinema'),
];

// ── Collections ─────────────────────────────────────────────────────────────
export const COLLECTIONS: TaxonomyCollection[] = [
  ...(
    [
      ['editors-picks', "Editor's Picks"],
      ['cinnetemple-originals', 'CinneTemple Originals'],
      ['exclusive-premieres', 'Exclusive Premieres'],
      ['weekend-picks', 'Weekend Movie Picks'],
      ['award-winning', 'Award-Winning Movies'],
      ['critically-acclaimed', 'Critically Acclaimed'],
      ['hidden-gems', 'Hidden Gems'],
      ['classic-cinema', 'Classic Cinema'],
      ['throwback-favorites', 'Throwback Favorites'],
    ] as const
  ).map(([slug, name]) => ({ slug, name, kind: 'EDITORIAL' as const, description: null })),
  ...(
    [
      ['new-listings', 'New Listings'],
      ['trending', 'Trending'],
      ['most-watched', 'Most Watched'],
      ['coming-soon', 'Coming Soon'],
      ['new-releases', 'New Releases'],
      ['acclaimed', 'Acclaimed'],
      ['series', 'Series'],
    ] as const
  ).map(([slug, name]) => ({ slug, name, kind: 'SYSTEM' as const, description: null })),
];

// ── Constants ───────────────────────────────────────────────────────────────
export const FORMATS: Taxonomy['formats'] = (
  [
    ['FEATURE_FILM', 'Feature Film'],
    ['SHORT_FILM', 'Short Film'],
    ['TV_SERIES', 'TV Series'],
    ['LIMITED_SERIES', 'Limited Series'],
    ['MINISERIES', 'Miniseries'],
    ['DOCUMENTARY_FILM', 'Documentary Film'],
    ['DOCUMENTARY_SERIES', 'Documentary Series'],
    ['ANIMATION_FILM', 'Animation Film'],
    ['ANIMATED_SERIES', 'Animated Series'],
    ['STANDUP_COMEDY', 'Stand-up Comedy'],
    ['LIVE_PERFORMANCE', 'Live Performance'],
    ['SPECIAL', 'Special'],
    ['ANTHOLOGY', 'Anthology'],
    ['REALITY_SERIES', 'Reality Series'],
    ['MUSIC_FILM', 'Music Film'],
  ] as [ContentFormat, string][]
).map(([value, label]) => ({ value, label }));

export const AUDIENCES: Taxonomy['audiences'] = (
  [
    ['KIDS', 'Kids'],
    ['TEENS', 'Teens'],
    ['FAMILY', 'Family'],
    ['ADULTS', 'Adults'],
  ] as [Audience, string][]
).map(([value, label]) => ({ value, label }));

export const ACCESS_TYPES: Taxonomy['accessTypes'] = (
  [
    ['FREE', 'Free'],
    ['SUBSCRIPTION', 'Subscription'],
    ['PAY_PER_VIEW', 'Pay-per-view'],
    ['RENTAL', 'Rental'],
    ['PURCHASE', 'Purchase'],
    ['PROMOTIONAL', 'Promotional'],
  ] as [AccessType, string][]
).map(([value, label]) => ({ value, label }));

export const LANGUAGES: Taxonomy['languages'] = (
  [
    ['en', 'English'], ['yo', 'Yoruba'], ['ig', 'Igbo'], ['ha', 'Hausa'],
    ['pcm', 'Nigerian Pidgin'], ['fr', 'French'], ['es', 'Spanish'], ['ar', 'Arabic'],
    ['hi', 'Hindi'], ['ko', 'Korean'], ['ja', 'Japanese'], ['zh', 'Mandarin'],
    ['pt', 'Portuguese'], ['sw', 'Swahili'], ['tw', 'Twi'], ['zu', 'Zulu'],
  ] as [string, string][]
).map(([code, name]) => ({ code, name }));

export const DECADES = ['1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

// ── Seeded homepage sections (spec table, in position order) ───────────────
type SeedSection = [
  slug: string,
  title: string,
  kind: HomeSectionKind,
  sort: HomeSort,
  rules: SectionRules,
  minItems: number,
  opts?: { limit?: number; enabled?: boolean },
];

export const SECTION_SEED: SeedSection[] = [
  ['continue-watching', 'Continue Watching', 'CONTINUE_WATCHING', 'POPULARITY', {}, 1],
  ['newly-added', 'Newly Added', 'RULE', 'PUBLISHED_DESC', {}, 1],
  ['trending-now', 'Trending Now', 'RULE', 'PLAYS_7D', { anyOf: [{ collectionsAny: ['trending'] }, { minPlays7d: 1 }] }, 4],
  ['top-10-week', 'Top 10 This Week', 'RULE', 'PLAYS_7D', { minPlays7d: 1 }, 5, { limit: 10 }],
  ['exclusive-premieres', 'Exclusive Premieres', 'RULE', 'RELEASE_DESC', { anyOf: [{ collectionsAny: ['exclusive-premieres'] }, { premiere: true }] }, 1],
  ['coming-soon', 'Coming Soon', 'RULE', 'RELEASE_ASC', { anyOf: [{ upcoming: true }, { collectionsAny: ['coming-soon'] }] }, 1],
  ['nollywood-blockbusters', 'Nollywood Blockbusters', 'RULE', 'POPULARITY', { industriesAny: ['nollywood'] }, 4],
  ['action-packed', 'Action-Packed Movies', 'RULE', 'POPULARITY', { genresAny: ['action'] }, 4],
  ['laugh-out-loud', 'Laugh Out Loud', 'RULE', 'POPULARITY', { genresAny: ['comedy'] }, 4],
  ['love-romance', 'Love & Romance', 'RULE', 'POPULARITY', { genresAny: ['romance'] }, 4],
  ['thrillers', 'Edge-of-Your-Seat Thrillers', 'RULE', 'POPULARITY', { genresAny: ['thriller'] }, 4],
  ['binge-worthy-series', 'Binge-Worthy Series', 'RULE', 'POPULARITY', { types: ['series'] }, 2],
  ['recently-added-episodes', 'Recently Added Episodes', 'RULE', 'LATEST_EPISODE', { types: ['series'], hasEpisodeWithinDays: 30 }, 2],
  ['family-movie-night', 'Family Movie Night', 'RULE', 'POPULARITY', { anyOf: [{ genresAny: ['family'] }, { audiencesAny: ['FAMILY', 'KIDS'] }] }, 4],
  ['free-to-watch', 'Free to Watch', 'RULE', 'POPULARITY', { accessAny: ['FREE', 'PROMOTIONAL'] }, 2],
  ['african-stories', 'African Stories', 'RULE', 'POPULARITY', { industriesAny: ['african-cinema'] }, 4],
  ['editors-picks', "Editor's Picks", 'RULE', 'MANUAL', { collectionsAny: ['editors-picks'] }, 3],
  ['your-watchlist', 'Your Watchlist', 'WATCHLIST', 'POPULARITY', {}, 1],
  ['latest-releases', 'Latest Releases', 'RULE', 'RELEASE_DESC', { anyOf: [{ releasedWithinDays: 365 }, { collectionsAny: ['new-releases'] }] }, 4],
  ['top-10-today', 'Top 10 Movies Today', 'RULE', 'PLAYS_1D', { types: ['movie'], minPlays1d: 1 }, 5, { limit: 10 }],
  ['most-watched', 'Most Watched', 'RULE', 'PLAYS_ALL', { anyOf: [{ collectionsAny: ['most-watched'] }, { minPlaysAll: 1 }] }, 4],
  ['popular', 'Popular on CinneTemple', 'RULE', 'POPULARITY', {}, 8],
  ['recommended', 'Recommended for You', 'RECOMMENDED', 'POPULARITY', {}, 4, { enabled: false }],
  ['because-you-watched', 'Because You Watched…', 'BECAUSE_YOU_WATCHED', 'POPULARITY', {}, 4, { enabled: false }],
  ['cinnetemple-originals', 'CinneTemple Originals', 'RULE', 'MANUAL', { collectionsAny: ['cinnetemple-originals'] }, 3],
  ['horror-nights', 'Horror Nights', 'RULE', 'POPULARITY', { genresAny: ['horror'] }, 4],
  ['crime-investigation', 'Crime & Investigation', 'RULE', 'POPULARITY', { anyOf: [{ genresAny: ['crime', 'mystery'] }, { tagsAny: ['true-crime'] }] }, 4],
  ['faith-inspiration', 'Faith & Inspiration', 'RULE', 'POPULARITY', { anyOf: [{ genresAny: ['faith-spirituality'] }, { tagsAny: ['inspirational', 'spirituality'] }] }, 4],
  ['based-on-true-stories', 'Based on True Stories', 'RULE', 'POPULARITY', { tagsAny: ['true-story'] }, 4],
  ['hollywood-hits', 'Hollywood Hits', 'RULE', 'POPULARITY', { industriesAny: ['hollywood'] }, 4],
  ['korean-dramas', 'Korean Dramas', 'RULE', 'POPULARITY', { industriesAny: ['korean-cinema'], genresAny: ['drama'] }, 4],
  ['bollywood-favorites', 'Bollywood Favorites', 'RULE', 'POPULARITY', { industriesAny: ['bollywood'] }, 4],
  ['award-winning', 'Award-Winning Movies', 'RULE', 'MANUAL', { collectionsAny: ['award-winning'] }, 3],
  ['critically-acclaimed', 'Critically Acclaimed', 'RULE', 'RATING_DESC', { collectionsAny: ['critically-acclaimed', 'acclaimed'] }, 3],
  ['hidden-gems', 'Hidden Gems', 'RULE', 'MANUAL', { collectionsAny: ['hidden-gems'] }, 3],
  ['weekend-picks', 'Weekend Movie Picks', 'RULE', 'MANUAL', { collectionsAny: ['weekend-picks'] }, 3],
  ['under-90-minutes', 'Movies Under 90 Minutes', 'RULE', 'POPULARITY', { types: ['movie'], maxRuntimeMinutes: 90 }, 4],
  ['epic-movies', 'Epic Movies', 'RULE', 'POPULARITY', { types: ['movie'], minRuntimeMinutes: 150 }, 4],
  ['complete-series', 'Complete Series', 'RULE', 'POPULARITY', { types: ['series'], seriesComplete: true }, 3],
  ['classic-cinema', 'Classic Cinema', 'RULE', 'RELEASE_ASC', { collectionsAny: ['classic-cinema'] }, 3],
  ['throwback-favorites', 'Throwback Favorites', 'RULE', 'POPULARITY', { anyOf: [{ collectionsAny: ['throwback-favorites'] }, { releaseYearMin: 1990, releaseYearMax: 2010 }] }, 4],
  ['strong-female-leads', 'Strong Female Leads', 'RULE', 'POPULARITY', { tagsAny: ['strong-female-lead'] }, 4],
  ['supernatural-stories', 'Supernatural Stories', 'RULE', 'POPULARITY', { genresAny: ['horror-supernatural', 'horror-paranormal'] }, 4],
  ['high-school-campus', 'High School & Campus', 'RULE', 'POPULARITY', { anyOf: [{ tagsAny: ['school-campus'] }, { genresAny: ['teen-young-adult-school'] }] }, 4],
  ['weddings-relationships', 'Weddings & Relationships', 'RULE', 'POPULARITY', { tagsAny: ['wedding', 'marriage', 'infidelity'] }, 4],
  ['royalty-kingdoms', 'Royalty & Kingdoms', 'RULE', 'POPULARITY', { tagsAny: ['royalty'] }, 4],
  ['village-stories', 'Village Stories', 'RULE', 'POPULARITY', { tagsAny: ['village'] }, 4],
  ['revenge-betrayal', 'Revenge & Betrayal', 'RULE', 'POPULARITY', { tagsAny: ['revenge', 'betrayal'] }, 4],
  ['money-power-ambition', 'Money, Power & Ambition', 'RULE', 'POPULARITY', { tagsAny: ['wealth', 'power', 'ambition'] }, 4],
  ['premium-premieres', 'Premium Premieres', 'RULE', 'PUBLISHED_DESC', { accessAny: ['PAY_PER_VIEW', 'RENTAL', 'PURCHASE'], anyOf: [{ premiere: true }, { publishedWithinDays: 90 }] }, 4],
  ['limited-time', 'Limited-Time Releases', 'RULE', 'EXPIRING_SOON', { expiringWithinDays: 30 }, 2],
];

export const RULE_KEYS: (keyof SectionRules)[] = SECTION_RULE_KEYS;

/** Unknown keys (recursively through anyOf); empty = valid. */
export function unknownRuleKeys(rules: SectionRules): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(rules)) {
    if (!RULE_KEYS.includes(k as keyof SectionRules)) bad.push(k);
    if (k === 'anyOf' && Array.isArray(v)) for (const b of v) bad.push(...unknownRuleKeys(b));
  }
  return bad;
}

// ── Simplified engine ───────────────────────────────────────────────────────
export const HOME_MAX_ROWS = 18;
const DAY = 86_400_000;

export interface MockCandidate {
  id: string;
  type: 'movie' | 'series';
  published: boolean;
  playable: boolean;
  format: ContentFormat;
  genres: string[];
  tags: string[];
  collections: string[];
  industries: string[];
  audience: Audience | null;
  access: AccessType;
  runtimeMinutes: number | null;
  releaseDate: number;
  publishedAt: number | null;
  isPremiere: boolean;
  premiereStartAt: number | null;
  availableFrom: number | null;
  availableUntil: number | null;
  seriesComplete: boolean;
  latestEpisodeAt: number | null;
  plays1d: number;
  plays7d: number;
  playsAll: number;
  popularity: number;
  rating: number;
  summary: TitleSummary;
}

const isUpcoming = (c: MockCandidate, now: number) =>
  c.releaseDate > now ||
  (c.premiereStartAt !== null && c.premiereStartAt > now) ||
  (c.availableFrom !== null && c.availableFrom > now);

/** True when `rules` (or any anyOf branch, recursively) has `upcoming: true`. */
export function sectionIsUpcoming(rules: SectionRules): boolean {
  return rules.upcoming === true || (rules.anyOf ?? []).some(sectionIsUpcoming);
}

/**
 * null = eligible; otherwise the reason. Upcoming sections skip the "out now"
 * and playable checks but still drop expired titles (as the backend does).
 */
export function baseEligibility(c: MockCandidate, now: number, upcoming: boolean): string | null {
  if (!c.published) return 'Not published';
  const expired = c.availableUntil !== null && c.availableUntil <= now;
  const notYet = c.availableFrom !== null && c.availableFrom > now;
  if (expired || (!upcoming && notYet)) return 'Outside its availability window';
  if (!upcoming && !c.playable) return 'No video yet';
  return null;
}

const anyIn = (have: string[], want: string[] | undefined) =>
  !want || want.some((w) => have.includes(w));

/** `t` within the last `days` days, up to now. */
const inPast = (t: number | null, now: number, days: number) =>
  t !== null && t <= now && t >= now - days * DAY;

export function matchesRules(
  c: MockCandidate,
  r: SectionRules,
  now: number,
  parents: Map<string, string>,
): boolean {
  if (r.types && !r.types.includes(c.type)) return false;
  if (r.formats && !r.formats.includes(c.format)) return false;
  if (r.genresAny && !r.genresAny.some((w) => c.genres.some((g) => g === w || parents.get(g) === w)))
    return false;
  if (!anyIn(c.tags, r.tagsAny)) return false;
  if (!anyIn(c.collections, r.collectionsAny)) return false;
  if (!anyIn(c.industries, r.industriesAny)) return false;
  if (r.audiencesAny && !(c.audience && r.audiencesAny.includes(c.audience))) return false;
  if (r.accessAny && !r.accessAny.includes(c.access)) return false;
  if (r.minRuntimeMinutes !== undefined && !(c.runtimeMinutes !== null && c.runtimeMinutes >= r.minRuntimeMinutes)) return false;
  if (r.maxRuntimeMinutes !== undefined && !(c.runtimeMinutes !== null && c.runtimeMinutes <= r.maxRuntimeMinutes)) return false;
  if (r.releasedWithinDays !== undefined && !inPast(c.releaseDate, now, r.releasedWithinDays)) return false;
  if (r.publishedWithinDays !== undefined && !inPast(c.publishedAt, now, r.publishedWithinDays)) return false;
  const year = new Date(c.releaseDate).getUTCFullYear();
  if (r.releaseYearMin !== undefined && year < r.releaseYearMin) return false;
  if (r.releaseYearMax !== undefined && year > r.releaseYearMax) return false;
  if (r.premiere !== undefined && c.isPremiere !== r.premiere) return false;
  if (r.upcoming !== undefined && isUpcoming(c, now) !== r.upcoming) return false;
  if (r.expiringWithinDays !== undefined && !(c.availableUntil !== null && c.availableUntil > now && c.availableUntil <= now + r.expiringWithinDays * DAY)) return false;
  if (r.seriesComplete !== undefined && (c.type === 'series' && c.seriesComplete) !== r.seriesComplete) return false;
  if (r.hasEpisodeWithinDays !== undefined && !(c.type === 'series' && inPast(c.latestEpisodeAt, now, r.hasEpisodeWithinDays))) return false;
  if (r.minPlays1d !== undefined && c.plays1d < r.minPlays1d) return false;
  if (r.minPlays7d !== undefined && c.plays7d < r.minPlays7d) return false;
  if (r.minPlaysAll !== undefined && c.playsAll < r.minPlaysAll) return false;
  // An empty anyOf matches nothing, as on the server.
  if (r.anyOf && !r.anyOf.some((b) => matchesRules(c, b, now, parents))) return false;
  return true;
}

function sortKey(sort: HomeSort): (a: MockCandidate, b: MockCandidate) => number {
  const pop = (a: MockCandidate, b: MockCandidate) => b.popularity - a.popularity || b.playsAll - a.playsAll;
  switch (sort) {
    case 'PUBLISHED_DESC': return (a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
    case 'RELEASE_DESC': return (a, b) => b.releaseDate - a.releaseDate;
    case 'RELEASE_ASC': return (a, b) => a.releaseDate - b.releaseDate;
    case 'RATING_DESC': return (a, b) => b.rating - a.rating;
    case 'PLAYS_1D': return (a, b) => b.plays1d - a.plays1d || pop(a, b);
    case 'PLAYS_7D': return (a, b) => b.plays7d - a.plays7d || pop(a, b);
    case 'PLAYS_ALL': return (a, b) => b.playsAll - a.playsAll || pop(a, b);
    case 'LATEST_EPISODE': return (a, b) => (b.latestEpisodeAt ?? 0) - (a.latestEpisodeAt ?? 0);
    case 'EXPIRING_SOON': return (a, b) => (a.availableUntil ?? Infinity) - (b.availableUntil ?? Infinity);
    // MANUAL: the mock keeps no per-collection order, so it falls back to popularity.
    default: return pop;
  }
}

export interface MockSectionLike {
  rules: SectionRules;
  sort: HomeSort;
  limit: number;
  pinnedTitleIds: string[];
  excludedTitleIds: string[];
}

export function buildSection(
  s: MockSectionLike,
  candidates: MockCandidate[],
  now: number,
  parents: Map<string, string>,
): { items: MockCandidate[]; eligibleCount: number } {
  const upcoming = sectionIsUpcoming(s.rules);
  const cmp = sortKey(s.sort);
  const ok = (c: MockCandidate) =>
    !s.excludedTitleIds.includes(c.id) && baseEligibility(c, now, upcoming) === null;
  // Pins lead when base-eligible and not excluded; like the server, they need not match the rules.
  const pinned: MockCandidate[] = [];
  for (const id of s.pinnedTitleIds) {
    const c = candidates.find((x) => x.id === id);
    if (c && ok(c) && !pinned.includes(c)) pinned.push(c);
  }
  const rest = candidates
    .filter((c) => !pinned.includes(c) && ok(c) && matchesRules(c, s.rules, now, parents))
    .sort((a, b) => cmp(a, b) || a.id.localeCompare(b.id));
  const all = [...pinned, ...rest];
  return { items: all.slice(0, s.limit), eligibleCount: all.length };
}
