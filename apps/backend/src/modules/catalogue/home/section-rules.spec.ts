import {
  baseEligibility,
  buildSection,
  isUpcomingSection,
  matchesRules,
  parseSectionRules,
  type HomeCandidate,
  type HomeSort,
  type SectionRules,
  type SectionSpec,
} from './section-rules';

const NOW = new Date('2026-10-27T12:00:00Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY);
const PARENTS = new Map([
  ['horror-supernatural', 'horror'],
  ['horror-psychological', 'horror'],
  ['thriller-psychological', 'thriller'],
]);

function cand(id: string, over: Partial<HomeCandidate> = {}): HomeCandidate {
  return {
    id,
    type: 'movie',
    published: true,
    format: 'FEATURE_FILM',
    genres: [],
    tags: [],
    collections: [],
    industries: [],
    audience: null,
    access: 'FREE',
    runtimeMinutes: 100,
    releaseDate: new Date('2020-01-01T00:00:00Z'),
    publishedAt: daysAgo(30),
    isPremiere: false,
    premiereStartAt: null,
    availableFrom: null,
    availableUntil: null,
    seriesComplete: false,
    latestEpisodeAt: null,
    playable: true,
    popularity: 0,
    rating: 0,
    plays1d: 0,
    plays7d: 0,
    playsAll: 0,
    collectionPositions: {},
    ...over,
  };
}

const match = (c: HomeCandidate, rules: SectionRules) => matchesRules(c, rules, NOW, PARENTS);

function section(over: Partial<SectionSpec> = {}): SectionSpec {
  return {
    rules: {},
    sort: 'POPULARITY',
    limit: 20,
    pinnedTitleIds: [],
    excludedTitleIds: [],
    ...over,
  };
}
const ids = (s: SectionSpec, cs: HomeCandidate[]) =>
  buildSection(s, cs, NOW, PARENTS).items.map((c) => c.id);

/** Every seeded section's rules from docs/content-classification.md. */
const SEEDED_RULES: Record<string, unknown> = {
  'newly-added': {},
  'trending-now': { anyOf: [{ collectionsAny: ['trending'] }, { minPlays7d: 1 }] },
  'top-10-week': { minPlays7d: 1 },
  'exclusive-premieres': {
    anyOf: [{ collectionsAny: ['exclusive-premieres'] }, { premiere: true }],
  },
  'coming-soon': { anyOf: [{ upcoming: true }, { collectionsAny: ['coming-soon'] }] },
  'nollywood-blockbusters': { industriesAny: ['nollywood'] },
  'action-packed': { genresAny: ['action'] },
  'laugh-out-loud': { genresAny: ['comedy'] },
  'love-romance': { genresAny: ['romance'] },
  thrillers: { genresAny: ['thriller'] },
  'binge-worthy-series': { types: ['series'] },
  'recently-added-episodes': { types: ['series'], hasEpisodeWithinDays: 30 },
  'family-movie-night': {
    anyOf: [{ genresAny: ['family'] }, { audiencesAny: ['FAMILY', 'KIDS'] }],
  },
  'free-to-watch': { accessAny: ['FREE', 'PROMOTIONAL'] },
  'african-stories': { industriesAny: ['african-cinema'] },
  'editors-picks': { collectionsAny: ['editors-picks'] },
  'latest-releases': { anyOf: [{ releasedWithinDays: 365 }, { collectionsAny: ['new-releases'] }] },
  'top-10-today': { types: ['movie'], minPlays1d: 1 },
  'most-watched': { anyOf: [{ collectionsAny: ['most-watched'] }, { minPlaysAll: 1 }] },
  popular: {},
  'cinnetemple-originals': { collectionsAny: ['cinnetemple-originals'] },
  'horror-nights': { genresAny: ['horror'] },
  'crime-investigation': {
    anyOf: [{ genresAny: ['crime', 'mystery'] }, { tagsAny: ['true-crime'] }],
  },
  'faith-inspiration': {
    anyOf: [{ genresAny: ['faith-spirituality'] }, { tagsAny: ['inspirational', 'spirituality'] }],
  },
  'based-on-true-stories': { tagsAny: ['true-story'] },
  'hollywood-hits': { industriesAny: ['hollywood'] },
  'korean-dramas': { industriesAny: ['korean-cinema'], genresAny: ['drama'] },
  'bollywood-favorites': { industriesAny: ['bollywood'] },
  'award-winning': { collectionsAny: ['award-winning'] },
  'critically-acclaimed': { collectionsAny: ['critically-acclaimed', 'acclaimed'] },
  'hidden-gems': { collectionsAny: ['hidden-gems'] },
  'weekend-picks': { collectionsAny: ['weekend-picks'] },
  'under-90-minutes': { types: ['movie'], maxRuntimeMinutes: 90 },
  'epic-movies': { types: ['movie'], minRuntimeMinutes: 150 },
  'complete-series': { types: ['series'], seriesComplete: true },
  'classic-cinema': { collectionsAny: ['classic-cinema'] },
  'throwback-favorites': {
    anyOf: [
      { collectionsAny: ['throwback-favorites'] },
      { releaseYearMin: 1990, releaseYearMax: 2010 },
    ],
  },
  'strong-female-leads': { tagsAny: ['strong-female-lead'] },
  'supernatural-stories': { genresAny: ['horror-supernatural', 'horror-paranormal'] },
  'high-school-campus': {
    anyOf: [{ tagsAny: ['school-campus'] }, { genresAny: ['teen-young-adult-school'] }],
  },
  'weddings-relationships': { tagsAny: ['wedding', 'marriage', 'infidelity'] },
  'royalty-kingdoms': { tagsAny: ['royalty'] },
  'village-stories': { tagsAny: ['village'] },
  'revenge-betrayal': { tagsAny: ['revenge', 'betrayal'] },
  'money-power-ambition': { tagsAny: ['wealth', 'power', 'ambition'] },
  'premium-premieres': {
    accessAny: ['PAY_PER_VIEW', 'RENTAL', 'PURCHASE'],
    anyOf: [{ premiere: true }, { publishedWithinDays: 90 }],
  },
  'limited-time': { expiringWithinDays: 30 },
};

describe('parseSectionRules', () => {
  it.each(Object.entries(SEEDED_RULES))('parses the seeded %s rules', (_slug, rules) => {
    expect(parseSectionRules(rules)).toEqual(rules);
  });

  it('covers all 47 seeded RULE sections', () => {
    expect(Object.keys(SEEDED_RULES)).toHaveLength(47);
  });

  it('accepts every key', () => {
    const all = {
      types: ['movie', 'series'],
      formats: ['FEATURE_FILM', 'MUSIC_FILM'],
      genresAny: ['action'],
      tagsAny: ['dark'],
      collectionsAny: ['trending'],
      industriesAny: ['nollywood'],
      audiencesAny: ['KIDS'],
      accessAny: ['RENTAL'],
      minRuntimeMinutes: 10,
      maxRuntimeMinutes: 200,
      releasedWithinDays: 30,
      publishedWithinDays: 30,
      releaseYearMin: 1990,
      releaseYearMax: 2000,
      premiere: true,
      upcoming: false,
      expiringWithinDays: 5,
      seriesComplete: true,
      hasEpisodeWithinDays: 7,
      minPlays1d: 1,
      minPlays7d: 2,
      minPlaysAll: 3,
      anyOf: [{ premiere: false }],
    };
    expect(parseSectionRules(all)).toEqual(all);
  });

  it('returns a copy, not the input', () => {
    const input = { genresAny: ['action'] };
    const out = parseSectionRules(input);
    out.genresAny!.push('x');
    expect(input.genresAny).toEqual(['action']);
  });

  it.each<[unknown, RegExp]>([
    [null, /rules must be an object/],
    [[], /rules must be an object/],
    ['{}', /rules must be an object/],
    [{ genre: ['action'] }, /Unknown rule key "genre" at rules/],
    [{ toString: 1 }, /Unknown rule key "toString"/],
    [{ types: ['film'] }, /rules\.types\[0\] must be one of movie, series/],
    [{ types: 'movie' }, /rules\.types must be an array/],
    [{ formats: ['MOVIE'] }, /rules\.formats\[0\]/],
    [{ audiencesAny: ['kids'] }, /audiencesAny\[0\]/],
    [{ accessAny: ['PAID'] }, /accessAny\[0\]/],
    [{ genresAny: [''] }, /genresAny\[0\] must be a non-empty string/],
    [{ tagsAny: [1] }, /tagsAny\[0\]/],
    [{ collectionsAny: 'trending' }, /collectionsAny must be an array/],
    [{ minPlays7d: '1' }, /minPlays7d must be a non-negative number/],
    [{ minRuntimeMinutes: -1 }, /non-negative/],
    [{ releasedWithinDays: Infinity }, /non-negative/],
    [{ releaseYearMin: 1990.5 }, /releaseYearMin must be an integer/],
    [{ premiere: 'yes' }, /premiere must be true or false/],
    [{ anyOf: {} }, /anyOf must be an array/],
    [{ anyOf: [1] }, /rules\.anyOf\[0\] must be an object/],
    [
      { anyOf: [{ premiere: true }, { bogus: 1 }] },
      /Unknown rule key "bogus" at rules\.anyOf\[1\]/,
    ],
    [{ anyOf: [{ anyOf: [{ types: ['x'] }] }] }, /rules\.anyOf\[0\]\.anyOf\[0\]\.types\[0\]/],
  ])('rejects %j', (input, message) => {
    expect(() => parseSectionRules(input)).toThrow(message);
  });
});

describe('baseEligibility', () => {
  it('accepts a published, playable title in its window', () => {
    expect(baseEligibility(cand('a'), NOW)).toBeNull();
  });

  it('requires PUBLISHED', () => {
    expect(baseEligibility(cand('a', { published: false }), NOW)).toBe('Not published');
    expect(baseEligibility(cand('a', { published: false }), NOW, true)).toBe('Not published');
  });

  it('enforces the rights window', () => {
    const reason = 'Outside its availability window';
    expect(baseEligibility(cand('a', { availableFrom: daysAhead(1) }), NOW)).toBe(reason);
    expect(baseEligibility(cand('a', { availableUntil: NOW }), NOW)).toBe(reason);
    expect(baseEligibility(cand('a', { availableUntil: daysAgo(1) }), NOW)).toBe(reason);
    expect(
      baseEligibility(cand('a', { availableFrom: NOW, availableUntil: daysAhead(1) }), NOW),
    ).toBeNull();
  });

  it('requires a playable title', () => {
    expect(baseEligibility(cand('a', { playable: false }), NOW)).toBe('No video yet');
  });

  it('upcoming mode skips out-now and playable but not expiry', () => {
    expect(
      baseEligibility(cand('a', { playable: false, availableFrom: daysAhead(3) }), NOW, true),
    ).toBeNull();
    expect(baseEligibility(cand('a', { availableUntil: daysAgo(1) }), NOW, true)).toBe(
      'Outside its availability window',
    );
  });
});

describe('matchesRules', () => {
  it('empty rules match everything', () => {
    expect(match(cand('a'), {})).toBe(true);
  });

  it('types and formats', () => {
    expect(match(cand('a'), { types: ['movie'] })).toBe(true);
    expect(match(cand('a'), { types: ['series'] })).toBe(false);
    expect(match(cand('a', { format: 'SHORT_FILM' }), { formats: ['SHORT_FILM', 'SPECIAL'] })).toBe(
      true,
    );
    expect(match(cand('a'), { formats: ['SHORT_FILM'] })).toBe(false);
  });

  it('genresAny matches exact slugs and parents of subgenres', () => {
    const psych = cand('a', { genres: ['horror-psychological'] });
    expect(match(psych, { genresAny: ['horror'] })).toBe(true);
    expect(match(psych, { genresAny: ['horror-psychological'] })).toBe(true);
    expect(match(psych, { genresAny: ['thriller'] })).toBe(false);
    expect(match(psych, { genresAny: ['comedy', 'horror'] })).toBe(true);
    // A parent tag does not match a rule naming a subgenre.
    expect(match(cand('b', { genres: ['horror'] }), { genresAny: ['horror-supernatural'] })).toBe(
      false,
    );
  });

  it('tags, collections, industries (OR within a list)', () => {
    const c = cand('a', {
      tags: ['revenge'],
      collections: ['trending'],
      industries: ['nollywood'],
    });
    expect(match(c, { tagsAny: ['betrayal', 'revenge'] })).toBe(true);
    expect(match(c, { tagsAny: ['betrayal'] })).toBe(false);
    expect(match(c, { collectionsAny: ['trending'] })).toBe(true);
    expect(match(c, { collectionsAny: ['editors-picks'] })).toBe(false);
    expect(match(c, { industriesAny: ['hollywood', 'nollywood'] })).toBe(true);
    expect(match(c, { industriesAny: ['hollywood'] })).toBe(false);
  });

  it('keys combine with AND', () => {
    const c = cand('a', { industries: ['korean-cinema'], genres: ['drama'] });
    expect(match(c, { industriesAny: ['korean-cinema'], genresAny: ['drama'] })).toBe(true);
    expect(match(c, { industriesAny: ['korean-cinema'], genresAny: ['comedy'] })).toBe(false);
  });

  it('audiences and access', () => {
    expect(match(cand('a', { audience: 'KIDS' }), { audiencesAny: ['FAMILY', 'KIDS'] })).toBe(true);
    expect(match(cand('a'), { audiencesAny: ['KIDS'] })).toBe(false);
    expect(
      match(cand('a', { access: 'PROMOTIONAL' }), { accessAny: ['FREE', 'PROMOTIONAL'] }),
    ).toBe(true);
    expect(match(cand('a', { access: 'RENTAL' }), { accessAny: ['FREE'] })).toBe(false);
  });

  it('runtime bounds are inclusive and need a runtime', () => {
    expect(match(cand('a', { runtimeMinutes: 90 }), { maxRuntimeMinutes: 90 })).toBe(true);
    expect(match(cand('a', { runtimeMinutes: 91 }), { maxRuntimeMinutes: 90 })).toBe(false);
    expect(match(cand('a', { runtimeMinutes: 150 }), { minRuntimeMinutes: 150 })).toBe(true);
    expect(match(cand('a', { runtimeMinutes: 149 }), { minRuntimeMinutes: 150 })).toBe(false);
    expect(match(cand('a', { runtimeMinutes: null }), { maxRuntimeMinutes: 90 })).toBe(false);
  });

  it('releasedWithinDays uses [now - N, now]', () => {
    expect(match(cand('a', { releaseDate: daysAgo(10) }), { releasedWithinDays: 30 })).toBe(true);
    expect(match(cand('a', { releaseDate: daysAgo(31) }), { releasedWithinDays: 30 })).toBe(false);
    expect(match(cand('a', { releaseDate: daysAhead(1) }), { releasedWithinDays: 30 })).toBe(false);
  });

  it('publishedWithinDays', () => {
    expect(match(cand('a', { publishedAt: daysAgo(89) }), { publishedWithinDays: 90 })).toBe(true);
    expect(match(cand('a', { publishedAt: daysAgo(91) }), { publishedWithinDays: 90 })).toBe(false);
  });

  it('release year bounds', () => {
    const c = cand('a', { releaseDate: new Date('2005-06-01T00:00:00Z') });
    expect(match(c, { releaseYearMin: 1990, releaseYearMax: 2010 })).toBe(true);
    expect(match(c, { releaseYearMin: 2006 })).toBe(false);
    expect(match(c, { releaseYearMax: 2004 })).toBe(false);
    expect(match(c, { releaseYearMin: 2005, releaseYearMax: 2005 })).toBe(true);
  });

  it('premiere', () => {
    expect(match(cand('a', { isPremiere: true }), { premiere: true })).toBe(true);
    expect(match(cand('a'), { premiere: true })).toBe(false);
    expect(match(cand('a'), { premiere: false })).toBe(true);
  });

  it('upcoming: release date, premiere start or rights start in the future', () => {
    expect(match(cand('a'), { upcoming: true })).toBe(false);
    expect(match(cand('a'), { upcoming: false })).toBe(true);
    expect(match(cand('a', { releaseDate: daysAhead(5) }), { upcoming: true })).toBe(true);
    expect(match(cand('a', { premiereStartAt: daysAhead(1) }), { upcoming: true })).toBe(true);
    expect(match(cand('a', { availableFrom: daysAhead(1) }), { upcoming: true })).toBe(true);
    expect(match(cand('a', { premiereStartAt: daysAgo(1) }), { upcoming: true })).toBe(false);
    expect(match(cand('a', { releaseDate: daysAhead(5) }), { upcoming: false })).toBe(false);
  });

  it('expiringWithinDays needs availableUntil in (now, now + N]', () => {
    expect(match(cand('a', { availableUntil: daysAhead(10) }), { expiringWithinDays: 30 })).toBe(
      true,
    );
    expect(match(cand('a', { availableUntil: daysAhead(31) }), { expiringWithinDays: 30 })).toBe(
      false,
    );
    expect(match(cand('a'), { expiringWithinDays: 30 })).toBe(false);
    expect(match(cand('a', { availableUntil: daysAgo(1) }), { expiringWithinDays: 30 })).toBe(
      false,
    );
  });

  it('seriesComplete', () => {
    const done = cand('s', { type: 'series', seriesComplete: true });
    expect(match(done, { seriesComplete: true })).toBe(true);
    expect(match(cand('s', { type: 'series' }), { seriesComplete: true })).toBe(false);
    expect(match(cand('s', { type: 'series' }), { seriesComplete: false })).toBe(true);
    expect(match(cand('m', { seriesComplete: true }), { seriesComplete: true })).toBe(false);
  });

  it('hasEpisodeWithinDays (series only)', () => {
    const fresh = cand('s', { type: 'series', latestEpisodeAt: daysAgo(3) });
    expect(match(fresh, { hasEpisodeWithinDays: 30 })).toBe(true);
    expect(match(fresh, { hasEpisodeWithinDays: 2 })).toBe(false);
    expect(match(cand('s', { type: 'series' }), { hasEpisodeWithinDays: 30 })).toBe(false);
    expect(match(cand('m', { latestEpisodeAt: daysAgo(1) }), { hasEpisodeWithinDays: 30 })).toBe(
      false,
    );
  });

  it('play thresholds', () => {
    const c = cand('a', { plays1d: 1, plays7d: 3, playsAll: 10 });
    expect(match(c, { minPlays1d: 1 })).toBe(true);
    expect(match(c, { minPlays1d: 2 })).toBe(false);
    expect(match(c, { minPlays7d: 3 })).toBe(true);
    expect(match(c, { minPlays7d: 4 })).toBe(false);
    expect(match(c, { minPlaysAll: 10 })).toBe(true);
    expect(match(c, { minPlaysAll: 11 })).toBe(false);
  });

  it('anyOf needs one branch, ANDed with the other keys', () => {
    const rules: SectionRules = {
      accessAny: ['PAY_PER_VIEW'],
      anyOf: [{ premiere: true }, { publishedWithinDays: 90 }],
    };
    expect(
      match(
        cand('a', { access: 'PAY_PER_VIEW', isPremiere: true, publishedAt: daysAgo(200) }),
        rules,
      ),
    ).toBe(true);
    expect(match(cand('a', { access: 'PAY_PER_VIEW', publishedAt: daysAgo(10) }), rules)).toBe(
      true,
    );
    expect(match(cand('a', { access: 'PAY_PER_VIEW', publishedAt: daysAgo(200) }), rules)).toBe(
      false,
    );
    expect(match(cand('a', { access: 'FREE', isPremiere: true }), rules)).toBe(false);
    expect(match(cand('a'), { anyOf: [] })).toBe(false);
  });

  it('nested anyOf and parent genres inside branches', () => {
    const rules: SectionRules = {
      anyOf: [{ tagsAny: ['true-crime'] }, { anyOf: [{ genresAny: ['horror'] }] }],
    };
    expect(match(cand('a', { genres: ['horror-supernatural'] }), rules)).toBe(true);
    expect(match(cand('a', { tags: ['true-crime'] }), rules)).toBe(true);
    expect(match(cand('a'), rules)).toBe(false);
  });
});

describe('buildSection', () => {
  it('drops ineligible titles and counts eligible ones', () => {
    const cs = [
      cand('a'),
      cand('b', { published: false }),
      cand('c', { playable: false }),
      cand('d', { availableUntil: daysAgo(1) }),
      cand('e', { availableFrom: daysAhead(1) }),
    ];
    const out = buildSection(section(), cs, NOW, PARENTS);
    expect(out.items.map((c) => c.id)).toEqual(['a']);
    expect(out.eligibleCount).toBe(1);
  });

  it('applies the rules', () => {
    const cs = [
      cand('a', { genres: ['horror-slasher'] }),
      cand('b', { genres: ['horror'] }),
      cand('c'),
    ];
    const parents = new Map([...PARENTS, ['horror-slasher', 'horror']]);
    const out = buildSection(section({ rules: { genresAny: ['horror'] } }), cs, NOW, parents);
    expect(out.items.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('pins lead in pinned order (if eligible), excludes are removed', () => {
    const cs = [
      cand('a', { popularity: 50 }),
      cand('b', { popularity: 40 }),
      cand('c', { popularity: 30 }),
      cand('d', { popularity: 20 }),
      cand('x', { popularity: 10, published: false }),
      cand('z', { popularity: 5, genres: ['comedy'] }),
    ];
    const s = section({
      rules: { genresAny: ['comedy'] },
      pinnedTitleIds: ['c', 'x', 'missing', 'a', 'c', 'b'],
      excludedTitleIds: ['b'],
    });
    const out = buildSection(s, cs, NOW, PARENTS);
    // c and a pinned (pins need not match rules), x ineligible, b excluded, then z by rule.
    expect(out.items.map((c) => c.id)).toEqual(['c', 'a', 'z']);
    expect(out.eligibleCount).toBe(3);
  });

  it('excluded rule matches are removed', () => {
    const out = buildSection(
      section({ excludedTitleIds: ['a'] }),
      [cand('a'), cand('b')],
      NOW,
      PARENTS,
    );
    expect(out.items.map((c) => c.id)).toEqual(['b']);
    expect(out.eligibleCount).toBe(1);
  });

  it('limit cuts after pins and sort; eligibleCount is before limit', () => {
    const cs = ['a', 'b', 'c', 'd', 'e'].map((id, i) => cand(id, { popularity: i }));
    const out = buildSection(section({ limit: 2, pinnedTitleIds: ['a'] }), cs, NOW, PARENTS);
    expect(out.items.map((c) => c.id)).toEqual(['a', 'e']);
    expect(out.eligibleCount).toBe(5);
  });

  describe('sorts', () => {
    const sortIds = (sort: HomeSort, cs: HomeCandidate[], rules: SectionRules = {}) =>
      ids(section({ sort, rules }), cs);

    it('POPULARITY: popularity desc, then playsAll desc, then id', () => {
      const cs = [
        cand('c', { popularity: 5, playsAll: 1 }),
        cand('b', { popularity: 5, playsAll: 1 }),
        cand('a', { popularity: 5, playsAll: 9 }),
        cand('d', { popularity: 9 }),
      ];
      expect(sortIds('POPULARITY', cs)).toEqual(['d', 'a', 'b', 'c']);
    });

    it('PUBLISHED_DESC', () => {
      const cs = [
        cand('a', { publishedAt: daysAgo(5) }),
        cand('c', { publishedAt: daysAgo(1) }),
        cand('b', { publishedAt: daysAgo(1) }),
      ];
      expect(sortIds('PUBLISHED_DESC', cs)).toEqual(['b', 'c', 'a']);
    });

    it('RELEASE_DESC and RELEASE_ASC', () => {
      const cs = [
        cand('a', { releaseDate: new Date('2010-01-01') }),
        cand('b', { releaseDate: new Date('2020-01-01') }),
        cand('c', { releaseDate: new Date('2015-01-01') }),
        cand('d', { releaseDate: new Date('2015-01-01') }),
      ];
      expect(sortIds('RELEASE_DESC', cs)).toEqual(['b', 'c', 'd', 'a']);
      expect(sortIds('RELEASE_ASC', cs)).toEqual(['a', 'c', 'd', 'b']);
    });

    it('RATING_DESC', () => {
      const cs = [cand('a', { rating: 7 }), cand('c', { rating: 9 }), cand('b', { rating: 9 })];
      expect(sortIds('RATING_DESC', cs)).toEqual(['b', 'c', 'a']);
    });

    it.each<[HomeSort, keyof HomeCandidate]>([
      ['PLAYS_1D', 'plays1d'],
      ['PLAYS_7D', 'plays7d'],
      ['PLAYS_ALL', 'playsAll'],
    ])('%s: plays desc, ties by popularity then id', (sort, key) => {
      const cs = [
        cand('a', { [key]: 1, popularity: 1 }),
        cand('b', { [key]: 5, popularity: 0 }),
        cand('d', { [key]: 1, popularity: 3 }),
        cand('c', { [key]: 1, popularity: 3 }),
      ];
      expect(sortIds(sort, cs)).toEqual(['b', 'c', 'd', 'a']);
    });

    it('LATEST_EPISODE: newest first, missing last', () => {
      const cs = [
        cand('a', { type: 'series', latestEpisodeAt: daysAgo(5) }),
        cand('b', { type: 'series', latestEpisodeAt: null }),
        cand('c', { type: 'series', latestEpisodeAt: daysAgo(1) }),
        cand('d', { type: 'series', latestEpisodeAt: daysAgo(5) }),
      ];
      expect(sortIds('LATEST_EPISODE', cs)).toEqual(['c', 'a', 'd', 'b']);
    });

    it('EXPIRING_SOON: availableUntil asc, open-ended last', () => {
      const cs = [
        cand('a', { availableUntil: daysAhead(10) }),
        cand('b'),
        cand('c', { availableUntil: daysAhead(2) }),
        cand('d', { availableUntil: daysAhead(10) }),
      ];
      expect(sortIds('EXPIRING_SOON', cs)).toEqual(['c', 'a', 'd', 'b']);
    });

    it('MANUAL: position in the first named collection, then addedAt, then id', () => {
      const pos = (position: number, addedDaysAgo: number) => ({
        position,
        addedAt: daysAgo(addedDaysAgo),
      });
      const cs = [
        cand('a', {
          collections: ['editors-picks'],
          collectionPositions: { 'editors-picks': pos(2, 1) },
        }),
        cand('b', {
          collections: ['editors-picks'],
          collectionPositions: { 'editors-picks': pos(0, 1) },
        }),
        cand('c', {
          collections: ['editors-picks'],
          collectionPositions: { 'editors-picks': pos(2, 9) },
        }),
        cand('d', {
          collections: ['other', 'editors-picks'],
          collectionPositions: { other: pos(0, 1), 'editors-picks': pos(1, 1) },
        }),
        cand('e', { collections: ['other'], collectionPositions: { other: pos(0, 1) } }),
      ];
      expect(sortIds('MANUAL', cs, { collectionsAny: ['editors-picks', 'other'] })).toEqual([
        'b',
        'd',
        'c',
        'a',
        'e',
      ]);
    });

    it('MANUAL finds the collection inside anyOf', () => {
      const cs = [
        cand('a', {
          collections: ['x'],
          collectionPositions: { x: { position: 1, addedAt: NOW } },
        }),
        cand('b', {
          collections: ['x'],
          collectionPositions: { x: { position: 0, addedAt: NOW } },
        }),
      ];
      expect(sortIds('MANUAL', cs, { anyOf: [{ collectionsAny: ['x'] }] })).toEqual(['b', 'a']);
    });

    it('is stable by id whatever the input order', () => {
      const cs = ['e', 'b', 'd', 'a', 'c'].map((id) => cand(id));
      expect(sortIds('POPULARITY', cs)).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(sortIds('POPULARITY', [...cs].reverse())).toEqual(['a', 'b', 'c', 'd', 'e']);
    });
  });

  describe('upcoming sections', () => {
    const comingSoon = section({
      sort: 'RELEASE_ASC',
      rules: parseSectionRules(SEEDED_RULES['coming-soon']),
    });

    it('detects upcoming at the top level or in anyOf', () => {
      expect(isUpcomingSection(comingSoon.rules)).toBe(true);
      expect(isUpcomingSection({ upcoming: true })).toBe(true);
      expect(isUpcomingSection({ upcoming: false })).toBe(false);
      expect(isUpcomingSection({})).toBe(false);
    });

    it('shows unreleased, unplayable titles but still requires PUBLISHED', () => {
      const cs = [
        cand('later', { releaseDate: daysAhead(20), playable: false }),
        cand('soon', { premiereStartAt: daysAhead(2), playable: false }),
        cand('rights', { availableFrom: daysAhead(5), playable: false }),
        cand('draft', { releaseDate: daysAhead(1), published: false }),
        cand('out'),
        cand('tagged', { collections: ['coming-soon'], playable: false }),
      ];
      const out = buildSection(comingSoon, cs, NOW, PARENTS);
      expect(out.items.map((c) => c.id).sort()).toEqual(['later', 'rights', 'soon', 'tagged']);
    });

    it('upcoming: true alone only lists titles not yet out', () => {
      const cs = [cand('out'), cand('later', { releaseDate: daysAhead(3), playable: false })];
      expect(ids(section({ rules: { upcoming: true } }), cs)).toEqual(['later']);
    });
  });
});
