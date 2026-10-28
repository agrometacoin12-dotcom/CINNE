import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

const load = async (entry) => {
  const { outputFiles } = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
};
const c = await load('src/lib/classification.ts');
const mock = await load('src/lib/mock-taxonomy.ts');
// The mock client reaches the preload bridge (window.studio) at import time.
globalThis.window ??= { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
const mockClient = await load('src/lib/mock-client.ts');
// The backend's real parser, when this checkout has it, to prove the mirror matches.
const BACKEND_RULES = '../backend/src/modules/catalogue/home/section-rules.ts';
const backend = existsSync(BACKEND_RULES) ? await load(BACKEND_RULES) : null;

const genres = [
  { slug: 'horror', name: 'Horror', subgenres: [{ slug: 'horror-psychological', name: 'Psychological' }, { slug: 'horror-slasher', name: 'Slasher' }] },
  { slug: 'thriller', name: 'Thriller', subgenres: [{ slug: 'thriller-psychological', name: 'Psychological' }, { slug: 'thriller-conspiracy', name: 'Conspiracy' }] },
  { slug: 'drama', name: 'Drama', subgenres: [{ slug: 'drama-family-drama', name: 'Family Drama' }] },
];

const dto = (over = {}) => ({
  titleId: 't1', type: 'movie', contentFormat: null, effectiveFormat: 'FEATURE_FILM',
  genres: ['horror-psychological', 'drama'], tags: ['dark', 'revenge'], collections: ['editors-picks'],
  industries: [{ slug: 'nollywood', name: 'Nollywood', source: 'auto' }, { slug: 'hollywood', name: 'Hollywood', source: 'manual' }],
  audience: 'ADULTS', ageRating: '18', ratingJurisdiction: 'NG', releaseDate: '2025-01-02',
  accessType: null, effectiveAccess: 'PAY_PER_VIEW', productionCountries: ['NG'], originalLanguages: ['en'],
  audioLanguages: ['en'], availableFrom: null, availableUntil: null, seriesComplete: false, placement: [],
  ...over,
});

test('slugify follows the spec examples, subgenres are parent-prefixed', () => {
  assert.equal(c.slugify('Faith & Spirituality'), 'faith-spirituality');
  assert.equal(c.slugify('Science Fiction'), 'science-fiction');
  assert.equal(c.slugify('Teen & Young Adult'), 'teen-young-adult');
  assert.equal(c.slugify('Reality & Unscripted'), 'reality-unscripted');
  assert.equal(c.subgenreSlug('animation', '2D'), 'animation-2d');
  assert.equal(c.subgenreSlug('science-fiction', 'AI'), 'science-fiction-ai');
  assert.equal(c.subgenreSlug('musical', 'Broadway-style'), 'musical-broadway-style');
  assert.equal(c.subgenreSlug('superhero', 'Marvel-style'), 'superhero-marvel-style');
});

test('mock seed has 30 genres with unique slugs, 51 sections and spec tag slugs', () => {
  assert.equal(mock.GENRES.length, 30);
  const all = mock.GENRES.flatMap((g) => [g.slug, ...g.subgenres.map((s) => s.slug)]);
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.includes('crime-detective') && all.includes('mystery-detective'));
  assert.ok(all.includes('teen-young-adult-school'));
  assert.equal(mock.SECTION_SEED.length, 51);
  assert.equal(new Set(mock.SECTION_SEED.map((s) => s[0])).size, 51);
  const tagSlugs = new Set(mock.TAGS.map((t) => t.slug));
  assert.equal(tagSlugs.size, mock.TAGS.length);
  for (const s of ['school-campus', 'royalty', 'true-story', 'true-crime', 'strong-female-lead', 'feel-good', 'coming-of-age'])
    assert.ok(tagSlugs.has(s), s);
  assert.equal(mock.INDUSTRIES.find((i) => i.slug === 'african-cinema').countries.length, 54);
});

test('groupGenres: empty query keeps all, parent match keeps all subgenres, sub match filters', () => {
  assert.equal(c.groupGenres(genres, '').length, 3);
  const psych = c.groupGenres(genres, 'psycho');
  assert.deepEqual(psych.map((g) => g.slug), ['horror', 'thriller']);
  assert.deepEqual(psych[0].subgenres.map((s) => s.slug), ['horror-psychological']);
  assert.equal(psych[0].parentMatch, false);
  const horror = c.groupGenres(genres, 'HORROR');
  assert.equal(horror.length, 1);
  assert.equal(horror[0].parentMatch, true);
  assert.equal(horror[0].subgenres.length, 2);
  assert.deepEqual(c.groupGenres(genres, 'nothing'), []);
});

test('legacyGenreNames maps subgenres to parent names, dedupes, keeps order', () => {
  assert.deepEqual(
    c.legacyGenreNames(['thriller-conspiracy', 'horror', 'horror-slasher', 'thriller', 'nope'], genres),
    ['Thriller', 'Horror'],
  );
  assert.equal(c.genreParentMap(genres).get('drama-family-drama'), 'drama');
  assert.equal(c.genreLabelMap(genres).get('horror-slasher'), 'Horror › Slasher');
});

test('groupTags orders kinds and omits empty ones', () => {
  const grouped = c.groupTags([
    { slug: 'true-story', name: 'Based on a True Story', kind: 'STORY' },
    { slug: 'dark', name: 'Dark', kind: 'MOOD' },
    { slug: 'revenge', name: 'Revenge', kind: 'THEME' },
  ]);
  assert.deepEqual(grouped.map((g) => g.kind), ['MOOD', 'THEME', 'STORY']);
});

test('country and language code validation', () => {
  assert.equal(c.normalizeCountryCode(' ng '), 'NG');
  assert.equal(c.normalizeCountryCode('NGA'), null);
  assert.equal(c.normalizeCountryCode('N1'), null);
  assert.equal(c.normalizeLanguageCode('PCM'), 'pcm');
  assert.equal(c.normalizeLanguageCode('e'), null);
  assert.equal(c.normalizeLanguageCode('engl'), null);
  assert.deepEqual(c.parseCodes('ng, gh us;NG zz9', 'country', ['US']), { codes: ['NG', 'GH'], invalid: ['zz9'] });
  assert.deepEqual(c.parseCodes('yo ig english', 'language'), { codes: ['yo', 'ig'], invalid: ['english'] });
});

test('deriveIndustries assigns NG/GH/US/IN and the international fallback', () => {
  const rules = mock.INDUSTRIES;
  assert.deepEqual(c.deriveIndustries(['NG'], ['en'], rules), ['nollywood', 'african-cinema']);
  assert.deepEqual(c.deriveIndustries(['NG'], ['ha'], rules), ['nollywood', 'kannywood', 'african-cinema']);
  assert.deepEqual(c.deriveIndustries(['GH'], [], rules), ['ghallywood', 'african-cinema']);
  assert.deepEqual(c.deriveIndustries(['US'], ['en'], rules), ['hollywood']);
  assert.deepEqual(c.deriveIndustries(['IN'], ['en'], rules), ['international-cinema']);
  assert.deepEqual(c.deriveIndustries(['IN'], ['hi'], rules), ['bollywood']);
  assert.deepEqual(c.deriveIndustries([], ['yo'], rules), ['yoruba-cinema']);
  assert.deepEqual(c.deriveIndustries(['AU'], ['en'], rules), ['international-cinema']);
  assert.deepEqual(c.deriveIndustries([], [], rules), []);
});

test('diffClassification sends only changed fields', () => {
  const base = dto();
  const draft = c.draftFromDto(base);
  assert.deepEqual(draft.industries, ['hollywood']);
  assert.deepEqual(c.diffClassification(base, draft), {});
  assert.equal(c.hasChanges(c.diffClassification(base, draft)), false);

  // Set-like lists ignore order; genres do not.
  assert.deepEqual(c.diffClassification(base, { ...draft, tags: ['revenge', 'dark'] }), {});
  assert.deepEqual(c.diffClassification(base, { ...draft, genres: ['drama', 'horror-psychological'] }), {
    genres: ['drama', 'horror-psychological'],
  });

  const edited = {
    ...draft,
    contentFormat: 'SHORT_FILM',
    audience: '',
    ageRating: '  ',
    accessType: 'FREE',
    industries: [],
    releaseDate: '',
    productionCountries: ['NG', 'GH'],
    seriesComplete: true,
  };
  assert.deepEqual(c.diffClassification(base, edited), {
    contentFormat: 'SHORT_FILM',
    industries: [],
    audience: null,
    ageRating: null,
    releaseDate: null,
    accessType: 'FREE',
    productionCountries: ['NG', 'GH'],
  });
  // seriesComplete only for series.
  const series = dto({ type: 'series' });
  assert.deepEqual(c.diffClassification(series, { ...c.draftFromDto(series), seriesComplete: true }), { seriesComplete: true });
});

test('availability round-trips through datetime-local and is validated', () => {
  const iso = '2026-11-01T09:30:00.000Z';
  const local = c.isoToLocalInput(iso);
  assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(c.localInputToIso(local), iso);
  assert.equal(c.localInputToIso(''), null);
  const base = dto({ availableFrom: iso });
  const draft = c.draftFromDto(base);
  assert.deepEqual(c.diffClassification(base, draft), {});
  assert.deepEqual(c.diffClassification(base, { ...draft, availableFrom: '' }), { availableFrom: null });

  assert.equal(c.validateDraft(draft), null);
  assert.match(c.validateDraft({ ...draft, availableUntil: '2026-10-01T00:00' }), /after/);
  assert.match(c.validateDraft({ ...draft, releaseDate: '2026-02-30' }), /Release date/);
  assert.match(c.validateDraft({ ...draft, productionCountries: ['ng'] }), /country/);
  assert.match(c.validateDraft({ ...draft, audioLanguages: ['english'] }), /language/);
});

test('moveItem and toggleValue', () => {
  assert.deepEqual(c.moveItem(['a', 'b', 'c'], 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(c.moveItem(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(c.moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(c.moveItem(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c']);
  const src = ['a', 'b'];
  c.moveItem(src, 0, 1);
  assert.deepEqual(src, ['a', 'b'], 'does not mutate');
  assert.deepEqual(c.toggleValue(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(c.toggleValue(['a'], 'b'), ['a', 'b']);
});

test('effective values, personal kinds, rule summaries and title search', () => {
  assert.equal(c.effectiveFormat('series', null), 'TV_SERIES');
  assert.equal(c.effectiveFormat('movie', ''), 'FEATURE_FILM');
  assert.equal(c.effectiveAccess(null, 0), 'FREE');
  assert.equal(c.effectiveAccess('', 250000), 'PAY_PER_VIEW');
  assert.equal(c.effectiveAccess('RENTAL', 0), 'RENTAL');
  assert.equal(c.isPersonalKind('CONTINUE_WATCHING'), true);
  assert.equal(c.isPersonalKind('RULE'), false);
  assert.equal(
    c.summarizeRules({ types: ['movie'], anyOf: [{ genresAny: ['family'] }, {}] }),
    'types: movie · any of (genres: family | anything)',
  );
  const titles = [{ id: '1', title: 'Lagos After Dark' }, { id: '2', title: 'Dark Lagoon' }, { id: '3', title: 'Suya' }];
  assert.deepEqual(c.searchTitles(titles, 'dark', ['2']).map((t) => t.id), ['1']);
  assert.deepEqual(c.searchTitles(titles, '  '), []);
});

test('mock engine: parent genre matches subgenres; pins lead; excludes removed', () => {
  const now = Date.parse('2026-10-27T00:00:00Z');
  const parents = c.genreParentMap(mock.GENRES);
  const cand = (id, over = {}) => ({
    id, type: 'movie', published: true, playable: true, format: 'FEATURE_FILM', genres: [], tags: [],
    collections: [], industries: [], audience: null, access: 'PAY_PER_VIEW', runtimeMinutes: 100,
    releaseDate: now - 86_400_000, publishedAt: now, isPremiere: false, premiereStartAt: null,
    availableFrom: null, availableUntil: null, seriesComplete: false, latestEpisodeAt: null,
    plays1d: 0, plays7d: 0, playsAll: 0, popularity: 50, rating: 4, summary: { id }, ...over,
  });
  const a = cand('a', { genres: ['horror-supernatural'], popularity: 10 });
  const b = cand('b', { genres: ['horror'], popularity: 90 });
  const d = cand('d', { genres: ['horror'], published: false });
  const e = cand('e', { genres: ['horror'], playable: false });
  assert.equal(mock.matchesRules(a, { genresAny: ['horror'] }, now, parents), true);
  assert.equal(mock.baseEligibility(d, now, false), 'Not published');
  assert.equal(mock.baseEligibility(e, now, false), 'No video yet');
  assert.equal(mock.baseEligibility(cand('w', { availableUntil: now - 1 }), now, false), 'Outside its availability window');
  const section = { rules: { genresAny: ['horror'] }, sort: 'POPULARITY', limit: 20, pinnedTitleIds: ['a'], excludedTitleIds: [] };
  const built = mock.buildSection(section, [a, b, d, e], now, parents);
  assert.deepEqual(built.items.map((x) => x.id), ['a', 'b']);
  assert.equal(built.eligibleCount, 2);
  const excl = mock.buildSection({ ...section, excludedTitleIds: ['b'] }, [a, b], now, parents);
  assert.deepEqual(excl.items.map((x) => x.id), ['a']);
  assert.deepEqual(mock.unknownRuleKeys({ genresAny: [], anyOf: [{ bogus: 1 }] }), ['bogus']);
});

// ── Section rules: validator ────────────────────────────────────────────────

/** One value for every SectionRules key, nested anyOf included. */
const FULL_RULES = {
  types: ['movie', 'series'],
  formats: ['FEATURE_FILM', 'MUSIC_FILM'],
  genresAny: ['horror', 'horror-psychological'],
  tagsAny: ['dark'],
  collectionsAny: ['editors-picks'],
  industriesAny: ['nollywood'],
  audiencesAny: ['KIDS', 'ADULTS'],
  accessAny: ['FREE', 'PROMOTIONAL'],
  minRuntimeMinutes: 60,
  maxRuntimeMinutes: 150.5,
  releasedWithinDays: 365,
  publishedWithinDays: 90,
  releaseYearMin: 1990,
  releaseYearMax: 2010,
  premiere: true,
  upcoming: false,
  expiringWithinDays: 30,
  seriesComplete: true,
  hasEpisodeWithinDays: 0,
  minPlays1d: 1,
  minPlays7d: 2,
  minPlaysAll: 3,
  anyOf: [{ collectionsAny: ['trending'] }, { minPlays7d: 1, anyOf: [{ premiere: true }] }],
};

const NUMBER_KEYS = [
  'minRuntimeMinutes', 'maxRuntimeMinutes', 'releasedWithinDays', 'publishedWithinDays',
  'releaseYearMin', 'releaseYearMax', 'expiringWithinDays', 'hasEpisodeWithinDays',
  'minPlays1d', 'minPlays7d', 'minPlaysAll',
];
const BOOLEAN_KEYS = ['premiere', 'upcoming', 'seriesComplete'];
const SLUG_KEYS = ['genresAny', 'tagsAny', 'collectionsAny', 'industriesAny'];
const ENUM_KEYS = {
  types: 'movie, series',
  formats: 'FEATURE_FILM, SHORT_FILM, TV_SERIES, LIMITED_SERIES, MINISERIES, DOCUMENTARY_FILM, DOCUMENTARY_SERIES, ANIMATION_FILM, ANIMATED_SERIES, STANDUP_COMEDY, LIVE_PERFORMANCE, SPECIAL, ANTHOLOGY, REALITY_SERIES, MUSIC_FILM',
  audiencesAny: 'KIDS, TEENS, FAMILY, ADULTS',
  accessAny: 'FREE, SUBSCRIPTION, PAY_PER_VIEW, RENTAL, PURCHASE, PROMOTIONAL',
};

const flipCase = (v) => (v === v.toLowerCase() ? v[0].toUpperCase() + v.slice(1) : v.toLowerCase());

/** [input, expected error message] — every key, wrong types, unknown keys, nesting. */
const BAD_RULES = [
  [null, 'rules must be an object'],
  [[], 'rules must be an object'],
  ['{}', 'rules must be an object'],
  [{ bogus: 1 }, 'Unknown rule key "bogus" at rules'],
  [JSON.parse('{"toString": 1}'), 'Unknown rule key "toString" at rules'],
  [JSON.parse('{"__proto__": {}}'), 'Unknown rule key "__proto__" at rules'],
  [{ genresAny: ['x'], GenresAny: ['x'] }, 'Unknown rule key "GenresAny" at rules'],
  [{ anyOf: [{ genresAny: ['x'] }, { nope: true }] }, 'Unknown rule key "nope" at rules.anyOf[1]'],
  [{ anyOf: [{ anyOf: [{ deep: 1 }] }] }, 'Unknown rule key "deep" at rules.anyOf[0].anyOf[0]'],
  [{ anyOf: {} }, 'rules.anyOf must be an array of rule objects'],
  [{ anyOf: [1] }, 'rules.anyOf[0] must be an object'],
  [{ anyOf: [{}, null] }, 'rules.anyOf[1] must be an object'],
  [{ anyOf: [{ anyOf: [[]] }] }, 'rules.anyOf[0].anyOf[0] must be an object'],
  [{ anyOf: [{ minPlays7d: -1 }] }, 'rules.anyOf[0].minPlays7d must be a non-negative number'],
  ...Object.entries(ENUM_KEYS).flatMap(([k, values]) => [
    [{ [k]: values.split(', ')[0] }, `rules.${k} must be an array`],
    [{ [k]: null }, `rules.${k} must be an array`],
    [{ [k]: [values.split(', ')[0], 'nope'] }, `rules.${k}[1] must be one of ${values}`],
    // Case matters: 'Movie', 'kids', 'free' are rejected.
    [{ [k]: [flipCase(values.split(', ')[0])] }, `rules.${k}[0] must be one of ${values}`],
    [{ [k]: [1] }, `rules.${k}[0] must be one of ${values}`],
  ]),
  ...SLUG_KEYS.flatMap((k) => [
    [{ [k]: 'horror' }, `rules.${k} must be an array of slugs`],
    [{ [k]: { 0: 'x' } }, `rules.${k} must be an array of slugs`],
    [{ [k]: [''] }, `rules.${k}[0] must be a non-empty string`],
    [{ [k]: ['ok', '   '] }, `rules.${k}[1] must be a non-empty string`],
    [{ [k]: [7] }, `rules.${k}[0] must be a non-empty string`],
  ]),
  ...NUMBER_KEYS.flatMap((k) => [
    [{ [k]: '5' }, `rules.${k} must be a non-negative number`],
    [{ [k]: -1 }, `rules.${k} must be a non-negative number`],
    [{ [k]: null }, `rules.${k} must be a non-negative number`],
    [{ [k]: true }, `rules.${k} must be a non-negative number`],
    [{ [k]: Number.NaN }, `rules.${k} must be a non-negative number`],
    [{ [k]: Number.POSITIVE_INFINITY }, `rules.${k} must be a non-negative number`],
  ]),
  [{ releaseYearMin: 1990.5 }, 'rules.releaseYearMin must be an integer'],
  [{ releaseYearMax: 2010.1 }, 'rules.releaseYearMax must be an integer'],
  ...BOOLEAN_KEYS.flatMap((k) => [
    [{ [k]: 'true' }, `rules.${k} must be true or false`],
    [{ [k]: 1 }, `rules.${k} must be true or false`],
    [{ [k]: null }, `rules.${k} must be true or false`],
  ]),
];

test('rules validator accepts every key (nested anyOf too) and returns a fresh copy', () => {
  assert.deepEqual(Object.keys(FULL_RULES).sort(), [...c.SECTION_RULE_KEYS].sort());
  assert.equal(c.SECTION_RULE_KEYS.length, 23);
  const parsed = c.parseSectionRules(FULL_RULES);
  assert.deepEqual(parsed, FULL_RULES);
  assert.notEqual(parsed.types, FULL_RULES.types);
  assert.notEqual(parsed.anyOf[1], FULL_RULES.anyOf[1]);
  assert.equal(c.sectionRulesError(FULL_RULES), null);
  // Zero, fractions and empty lists are valid values; undefined keys are dropped.
  assert.deepEqual(c.parseSectionRules({ minPlaysAll: 0, maxRuntimeMinutes: 89.5, genresAny: [], anyOf: [] }), {
    minPlaysAll: 0, maxRuntimeMinutes: 89.5, genresAny: [], anyOf: [],
  });
  assert.deepEqual(c.parseSectionRules({ types: undefined, premiere: false }), { premiere: false });
  assert.deepEqual(c.parseSectionRules({}), {});
});

test('rules validator rejects wrong types and unknown keys with the server messages', () => {
  for (const [input, message] of BAD_RULES) {
    assert.throws(() => c.parseSectionRules(input), { message }, JSON.stringify(input));
    assert.equal(c.sectionRulesError(input), message);
  }
  // Every key has at least one wrong-type case above.
  const covered = new Set(BAD_RULES.flatMap(([input]) => (input && typeof input === 'object' ? Object.keys(input) : [])));
  for (const k of c.SECTION_RULE_KEYS) assert.ok(covered.has(k), k);
});

test('rules validator matches the backend parseSectionRules exactly', { skip: !backend && 'backend not in this checkout' }, () => {
  const outcome = (parse, input) => {
    try {
      return { rules: parse(input) };
    } catch (e) {
      return { error: e.message };
    }
  };
  for (const input of [FULL_RULES, {}, { minPlaysAll: 0, genresAny: [] }, ...BAD_RULES.map(([i]) => i)]) {
    assert.deepEqual(outcome(c.parseSectionRules, input), outcome(backend.parseSectionRules, input), JSON.stringify(input));
  }
  for (const s of mock.SECTION_SEED) {
    assert.deepEqual(c.parseSectionRules(s[4]), backend.parseSectionRules(s[4]), s[0]);
  }
  assert.deepEqual(c.HOME_SORTS, [...backend.HOME_SORTS]);
  assert.deepEqual(c.CONTENT_FORMAT_VALUES, [...backend.CONTENT_FORMATS]);
  assert.deepEqual(c.AUDIENCE_VALUES, [...backend.AUDIENCES]);
  assert.deepEqual(c.ACCESS_TYPE_VALUES, [...backend.ACCESS_TYPES]);
  assert.equal(c.manualCollection(FULL_RULES), backend.manualCollection(FULL_RULES));
});

test('parseRulesJson reports JSON syntax, then rule errors', () => {
  assert.match(c.parseRulesJson('').error, /JSON object/);
  assert.match(c.parseRulesJson('{"types": ["movie"],}').error, /^Invalid JSON: /);
  assert.deepEqual(c.parseRulesJson('{"bogus": 1}'), { ok: false, error: 'Unknown rule key "bogus" at rules' });
  assert.deepEqual(c.parseRulesJson('null'), { ok: false, error: 'rules must be an object' });
  assert.deepEqual(c.parseRulesJson('{"anyOf":[{"minPlays7d":"1"}]}'), {
    ok: false,
    error: 'rules.anyOf[0].minPlays7d must be a non-negative number',
  });
  assert.deepEqual(c.parseRulesJson(' {"types": ["movie"]} '), { ok: true, rules: { types: ['movie'] } });
});

test('canonical JSON order, sameRules, manualCollection and the 11 sorts', () => {
  const messy = { anyOf: [{ minPlays7d: 1, collectionsAny: ['trending'] }], types: ['movie'] };
  assert.deepEqual(Object.keys(c.canonicalRules(messy)), ['types', 'anyOf']);
  assert.deepEqual(Object.keys(c.canonicalRules(messy).anyOf[0]), ['collectionsAny', 'minPlays7d']);
  assert.equal(
    c.rulesToJson(messy),
    '{\n  "types": [\n    "movie"\n  ],\n  "anyOf": [\n    {\n      "collectionsAny": [\n        "trending"\n      ],\n      "minPlays7d": 1\n    }\n  ]\n}',
  );
  assert.equal(c.sameRules(messy, { types: ['movie'], anyOf: [{ collectionsAny: ['trending'], minPlays7d: 1 }] }), true);
  assert.equal(c.sameRules(messy, { types: ['movie'] }), false);
  assert.equal(c.manualCollection({ anyOf: [{ premiere: true }, { collectionsAny: ['b'] }] }), 'b');
  assert.equal(c.manualCollection({ collectionsAny: ['a'], anyOf: [{ collectionsAny: ['b'] }] }), 'a');
  assert.equal(c.manualCollection({ collectionsAny: [] }), null);
  assert.equal(c.HOME_SORTS.length, 11);
  assert.equal(new Set(c.HOME_SORTS).size, 11);
  for (const sort of c.HOME_SORTS) assert.ok(c.SORT_LABELS[sort], sort);
});

// ── Section rules: form model ───────────────────────────────────────────────

/** Fails when any value anywhere is undefined or null. */
const assertNoHoles = (value, path = 'rules') => {
  assert.notEqual(value, undefined, path);
  assert.notEqual(value, null, path);
  if (Array.isArray(value)) value.forEach((v, i) => assertNoHoles(v, `${path}[${i}]`));
  else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) assertNoHoles(v, `${path}.${k}`);
};

test('form ↔ rules round-trips every seeded RULE section', () => {
  const ruleSeeds = mock.SECTION_SEED.filter((s) => s[2] === 'RULE');
  assert.equal(ruleSeeds.length, 47);
  for (const [slug, , , , rules] of ruleSeeds) {
    assert.equal(c.formUnsupportedReason(rules), null, slug);
    const draft = c.draftFromRules(rules);
    const back = c.rulesFromDraft(draft);
    assert.deepEqual(back.errors, {}, slug);
    assert.deepEqual(back.rules, rules, slug);
    assert.equal(c.rulesToJson(back.rules), c.rulesToJson(rules), slug);
    assert.deepEqual(c.draftFromRules(back.rules), draft, slug);
    assertNoHoles(back.rules);
    // Through the JSON tab as well.
    const viaJson = c.parseRulesJson(c.rulesToJson(back.rules));
    assert.equal(viaJson.ok, true, slug);
    assert.deepEqual(c.draftFromRules(viaJson.rules), draft, slug);
  }
});

test('form ↔ rules round-trips every key (one level of anyOf)', () => {
  const { anyOf, ...flat } = FULL_RULES;
  const rules = { ...flat, anyOf: [anyOf[0], { minPlays7d: 1, premiere: false }, {}] };
  const draft = c.draftFromRules(rules);
  assert.deepEqual(draft.types, ['movie', 'series']);
  assert.equal(draft.maxRuntimeMinutes, '150.5');
  assert.equal(draft.hasEpisodeWithinDays, '0');
  assert.equal(draft.premiere, 'yes');
  assert.equal(draft.upcoming, 'no');
  assert.equal(draft.anyOf.length, 3);
  assert.equal(draft.anyOf[1].premiere, 'no');
  assert.deepEqual(c.rulesFromDraft(draft), { rules, errors: {} });
});

test('empty form fields omit their keys; no undefined or null is ever produced', () => {
  assert.deepEqual(c.rulesFromDraft(c.emptyRulesDraft()), { rules: {}, errors: {} });
  const blankish = {
    ...c.emptyRulesDraft(),
    minRuntimeMinutes: '   ',
    releaseYearMin: '',
    premiere: 'any',
    genresAny: [],
    anyOf: [],
  };
  assert.deepEqual(c.rulesFromDraft(blankish).rules, {});
  // An empty branch is kept: `{}` matches every title, which the summary calls "anything".
  const withBranch = { ...c.emptyRulesDraft(), types: ['series'], anyOf: [c.emptyRulesForm()] };
  assert.deepEqual(c.rulesFromDraft(withBranch).rules, { types: ['series'], anyOf: [{}] });
  // Zero is a value, not an empty field; text is trimmed.
  const draft = { ...c.emptyRulesDraft(), minPlaysAll: '0', minPlays7d: ' 12 ', seriesComplete: 'no', upcoming: 'yes' };
  const { rules } = c.rulesFromDraft(draft);
  assert.deepEqual(rules, { upcoming: true, seriesComplete: false, minPlays7d: 12, minPlaysAll: 0 });
  assert.deepEqual(Object.keys(rules), ['upcoming', 'seriesComplete', 'minPlays7d', 'minPlaysAll']);
  assertNoHoles(rules);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(rules))), JSON.stringify(rules));
  for (const key of NUMBER_KEYS) {
    const one = c.rulesFromForm({ ...c.emptyRulesForm(), [key]: '' }).rules;
    assert.equal(key in one, false, key);
  }
});

test('invalid numbers are reported with the server message and left out', () => {
  const draft = {
    ...c.emptyRulesDraft(),
    minRuntimeMinutes: 'abc',
    maxRuntimeMinutes: '-1',
    releaseYearMin: '1990.5',
    releaseYearMax: '1e400',
    minPlays1d: '3',
    anyOf: [{ ...c.emptyRulesForm(), minPlays7d: 'x', tagsAny: ['dark'] }],
  };
  const { rules, errors } = c.rulesFromDraft(draft);
  assert.deepEqual(rules, { minPlays1d: 3, anyOf: [{ tagsAny: ['dark'] }] });
  assert.deepEqual(errors, {
    'rules.minRuntimeMinutes': 'rules.minRuntimeMinutes must be a non-negative number',
    'rules.maxRuntimeMinutes': 'rules.maxRuntimeMinutes must be a non-negative number',
    'rules.releaseYearMin': 'rules.releaseYearMin must be an integer',
    'rules.releaseYearMax': 'rules.releaseYearMax must be a non-negative number',
    'rules.anyOf[0].minPlays7d': 'rules.anyOf[0].minPlays7d must be a non-negative number',
  });
});

test('rules the form cannot show fall back to the JSON editor', () => {
  assert.match(c.formUnsupportedReason({ anyOf: [{ anyOf: [{ premiere: true }] }] }), /rules\.anyOf\[0\]\.anyOf nests/);
  assert.match(c.formUnsupportedReason({ anyOf: [] }), /rules\.anyOf has no branches/);
  assert.match(c.formUnsupportedReason({ genresAny: [] }), /rules\.genresAny is an empty list/);
  assert.match(c.formUnsupportedReason({ anyOf: [{ types: ['movie'] }, { tagsAny: [] }] }), /rules\.anyOf\[1\]\.tagsAny/);
  assert.equal(c.formUnsupportedReason({ anyOf: [{}, { premiere: false }] }), null);
  assert.equal(c.formUnsupportedReason(FULL_RULES) !== null, true);
});

// ── Mock client: PATCH validation and preview ──────────────────────────────

test('mock PATCH validates rules like the server; rows and preview follow new rules and sort', async () => {
  const client = new mockClient.MockApiClient();
  const bySlug = async (slug) => (await client.listHomeSections()).find((s) => s.slug === slug);
  const action = await bySlug('action-packed');
  assert.equal(action.live, false);

  const rejects = (body, message) =>
    assert.rejects(client.updateHomeSection(action.id, body), (e) => e.status === 400 && e.message === message);
  await rejects({ rules: { genresAny: ['action'], bogus: 1 } }, 'Invalid rules: Unknown rule key "bogus" at rules');
  await rejects({ rules: { anyOf: [{ minPlays7d: '1' }] } }, 'Invalid rules: rules.anyOf[0].minPlays7d must be a non-negative number');
  await rejects({ rules: { types: ['film'] } }, 'Invalid rules: rules.types[0] must be one of movie, series');
  await rejects({ sort: 'NEWEST' }, `sort must be one of the following values: ${c.HOME_SORTS.join(', ')}`);
  assert.deepEqual((await bySlug('action-packed')).rules, { genresAny: ['action'] }, 'rejected PATCH changed nothing');

  // Valid rules are stored as the parsed copy; the row goes live once enough titles match.
  const input = { industriesAny: ['nollywood'], minRuntimeMinutes: undefined };
  const saved = await client.updateHomeSection(action.id, { rules: input });
  input.industriesAny.push('hollywood');
  assert.deepEqual(saved.rules, { industriesAny: ['nollywood'] });
  assert.ok(saved.eligibleCount >= action.minItems);
  assert.equal(saved.live, true);
  assert.equal(saved.sort, 'POPULARITY', 'sort untouched when not sent');
  assert.ok((await client.getHomePreview()).rows.some((r) => r.slug === 'action-packed'));

  // Sort changes reorder the preview row.
  const year = (t) => t.year;
  await client.updateHomeSection(action.id, { sort: 'RELEASE_ASC' });
  const asc = (await client.getHomePreview()).rows.find((r) => r.slug === 'action-packed').items;
  await client.updateHomeSection(action.id, { sort: 'RELEASE_DESC' });
  const desc = (await client.getHomePreview()).rows.find((r) => r.slug === 'action-packed').items;
  assert.ok(asc.length > 2);
  assert.deepEqual(asc.map(year), [...asc.map(year)].sort((a, b) => a - b));
  assert.deepEqual(desc.map(year), [...desc.map(year)].sort((a, b) => b - a));
  assert.equal((await bySlug('action-packed')).sort, 'RELEASE_DESC');

  // Rules that match nothing hide the row again (an empty anyOf matches nothing, as on the server).
  const none = await client.updateHomeSection(action.id, { rules: { industriesAny: ['nollywood'], anyOf: [] } });
  assert.equal(none.eligibleCount, 0);
  assert.equal(none.live, false);
  assert.ok((await client.getHomePreview()).hidden.some((h) => h.slug === 'action-packed' && h.reason === 'Only 0 of 4 titles'));
});
