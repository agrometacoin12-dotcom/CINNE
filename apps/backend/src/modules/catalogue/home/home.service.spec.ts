import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { MediaService } from '../../media/media.service';
import { HOME_CACHE_TTL_MS, HomeService } from './home.service';

const NOW = new Date('2026-10-27T12:00:00Z');
const api = 'https://api.example.com';

type Row = Record<string, unknown> & { id: string };

function title(id: string, over: Record<string, unknown> = {}): Row {
  return {
    id,
    type: 'MOVIE',
    title: `Title ${id}`,
    year: 2020,
    rating: 7,
    genres: ['Drama'],
    posterKey: `posters/${id}.jpg`,
    status: 'PUBLISHED',
    videoKey: `videos/${id}.mp4`,
    popularity: 0,
    priceMinor: 0,
    runtimeMinutes: 100,
    durationSeconds: null,
    isPremiere: false,
    premiereStartAt: null,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    contentFormat: null,
    audience: null,
    accessType: null,
    releaseDate: null,
    availableFrom: null,
    availableUntil: null,
    seriesComplete: false,
    publishedAt: null,
    genreLinks: [],
    tagLinks: [],
    industryLinks: [],
    collectionLinks: [],
    ...over,
  };
}

const genre = (slug: string) => ({ genre: { slug } });

function sec(slug: string, position: number, over: Record<string, unknown> = {}) {
  return {
    id: `id-${slug}`,
    slug,
    title: slug.toUpperCase(),
    kind: 'RULE',
    rules: {},
    sort: 'POPULARITY',
    limit: 20,
    minItems: 1,
    enabled: true,
    position,
    pinnedTitleIds: [] as string[],
    excludedTitleIds: [] as string[],
    ...over,
  };
}

function setup(opts: {
  titles: Row[];
  sections: ReturnType<typeof sec>[];
  maxRows?: number;
  entitlementPlays?: Record<'d1' | 'd7' | 'all', { titleId: string; n: number }[]>;
  episodePlays?: Record<'d1' | 'd7' | 'all', { titleId: string; n: number }[]>;
  episodes?: { titleId: string; createdAt: Date }[];
}) {
  const playsFor =
    (src?: Record<'d1' | 'd7' | 'all', { titleId: string; n: number }[]>) =>
    async ({ where }: { where: { titleId?: string; startedAt: { gte?: Date } } }) => {
      if (!src) return [];
      const gte = where.startedAt.gte;
      const key = !gte ? 'all' : NOW.getTime() - gte.getTime() <= 86_400_000 + 5_000 ? 'd1' : 'd7';
      return src[key]
        .filter((r) => !where.titleId || r.titleId === where.titleId)
        .map((r) => ({ titleId: r.titleId, _count: { _all: r.n } }));
    };
  const prisma = {
    homepageSection: { findMany: jest.fn(async () => opts.sections) },
    catalogueTitle: {
      findMany: jest.fn(async ({ where }: { where: { id?: string; status?: string } }) =>
        opts.titles.filter((t) =>
          where.id ? t.id === where.id : where.status ? t.status === where.status : true,
        ),
      ),
    },
    genre: {
      findMany: jest.fn(async () => [{ slug: 'horror-supernatural', parent: { slug: 'horror' } }]),
    },
    entitlement: { groupBy: jest.fn(playsFor(opts.entitlementPlays)) },
    episodePlayback: { groupBy: jest.fn(playsFor(opts.episodePlays)) },
    episode: {
      groupBy: jest.fn(async ({ where }: { where: { titleId?: string } }) =>
        (opts.episodes ?? [])
          .filter((e) => !where.titleId || e.titleId === where.titleId)
          .map((e) => ({ titleId: e.titleId, _max: { createdAt: e.createdAt } })),
      ),
    },
  };
  const media = new MediaService(new ConfigService({ apiPublicUrl: api }));
  const config = new ConfigService(opts.maxRows ? { homeMaxRows: opts.maxRows } : {});
  const service = new HomeService(prisma as unknown as PrismaService, media, config);
  return { service, prisma };
}

describe('HomeService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => jest.useRealTimers());

  it('builds browse rows with summaries identical to CatalogueService', async () => {
    const { service } = setup({
      titles: [title('a', { popularity: 1 }), title('b', { popularity: 2 })],
      sections: [sec('popular', 0)],
    });
    expect(await service.rows()).toEqual([
      {
        slug: 'popular',
        title: 'POPULAR',
        items: ['b', 'a'].map((id) => ({
          id,
          type: 'movie',
          title: `Title ${id}`,
          year: 2020,
          rating: 7,
          genres: ['Drama'],
          posterUrl: `${api}/media/posters/${id}.jpg`,
        })),
      },
    ]);
  });

  it('only loads published titles for browse', async () => {
    const { service, prisma } = setup({
      titles: [title('a'), title('d', { status: 'DRAFT' })],
      sections: [sec('popular', 0)],
    });
    const [row] = await service.rows();
    expect(row!.items.map((i) => i.id)).toEqual(['a']);
    expect(prisma.catalogueTitle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PUBLISHED' } }),
    );
  });

  it('skips personal kinds and disabled sections, enforces minItems and the row cap', async () => {
    const { service } = setup({
      maxRows: 2,
      titles: [
        title('a', { genreLinks: [genre('horror-supernatural')] }),
        title('b', { genreLinks: [genre('comedy')] }),
        title('s', { type: 'SERIES', videoKey: null }),
      ],
      episodes: [{ titleId: 's', createdAt: new Date('2026-10-20T00:00:00Z') }],
      sections: [
        sec('continue-watching', 0, { kind: 'CONTINUE_WATCHING' }),
        sec('horror', 1, { rules: { genresAny: ['horror'] } }),
        sec('needs-four', 2, { minItems: 4 }),
        sec('off', 3, { enabled: false }),
        sec('series', 4, { rules: { types: ['series'] } }),
        sec('comedy', 5, { rules: { genresAny: ['comedy'] } }),
        sec('watchlist', 6, { kind: 'WATCHLIST', enabled: true }),
        sec('broken', 7, { rules: { nope: 1 } }),
      ],
    });
    const preview = await service.preview();
    expect(preview.rows.map((r) => [r.slug, r.count, r.items.map((i) => i.id)])).toEqual([
      ['horror', 1, ['a']],
      ['series', 1, ['s']],
    ]);
    expect(preview.hidden).toEqual([
      {
        slug: 'continue-watching',
        title: 'CONTINUE-WATCHING',
        reason: "Shown in the app's own rail",
      },
      { slug: 'needs-four', title: 'NEEDS-FOUR', reason: 'Only 3 of 4 titles' },
      { slug: 'off', title: 'OFF', reason: 'Disabled' },
      { slug: 'comedy', title: 'COMEDY', reason: 'Over the 2-row limit' },
      { slug: 'watchlist', title: 'WATCHLIST', reason: "Shown in the app's own rail" },
      {
        slug: 'broken',
        title: 'BROKEN',
        reason: expect.stringMatching(/^Invalid rules: Unknown rule key "nope"/),
      },
    ]);
    expect((await service.rows()).map((r) => r.slug)).toEqual(['horror', 'series']);

    const counts = await service.sectionsWithCounts();
    expect(counts.get('id-continue-watching')).toEqual({ eligibleCount: null, live: false });
    expect(counts.get('id-horror')).toEqual({ eligibleCount: 1, live: true });
    expect(counts.get('id-needs-four')).toEqual({ eligibleCount: 3, live: false });
    expect(counts.get('id-off')).toEqual({ eligibleCount: 3, live: false });
    expect(counts.get('id-comedy')).toEqual({ eligibleCount: 1, live: false });
  });

  it('defaults to 18 rows', async () => {
    const sections = Array.from({ length: 20 }, (_, i) => sec(`s${i}`, i));
    const { service } = setup({ titles: [title('a')], sections });
    const preview = await service.preview();
    expect(preview.rows).toHaveLength(18);
    expect(preview.hidden.map((h) => h.reason)).toEqual([
      'Over the 18-row limit',
      'Over the 18-row limit',
    ]);
  });

  it('counts plays from entitlements and episode playback per window', async () => {
    const { service } = setup({
      titles: [title('a'), title('b'), title('c')],
      entitlementPlays: {
        d1: [{ titleId: 'b', n: 1 }],
        d7: [
          { titleId: 'b', n: 1 },
          { titleId: 'a', n: 1 },
        ],
        all: [
          { titleId: 'a', n: 5 },
          { titleId: 'b', n: 1 },
        ],
      },
      episodePlays: { d1: [], d7: [{ titleId: 'a', n: 2 }], all: [{ titleId: 'a', n: 2 }] },
      sections: [
        sec('week', 0, { sort: 'PLAYS_7D', rules: { minPlays7d: 1 } }),
        sec('today', 1, { sort: 'PLAYS_1D', rules: { minPlays1d: 1 } }),
        sec('ever', 2, { sort: 'PLAYS_ALL', rules: { minPlaysAll: 7 } }),
      ],
    });
    const rows = await service.rows();
    expect(rows.map((r) => [r.slug, r.items.map((i) => i.id)])).toEqual([
      ['week', ['a', 'b']],
      ['today', ['b']],
      ['ever', ['a']],
    ]);
  });

  it('caches for 60 s and invalidate() clears the cache', async () => {
    const { service, prisma } = setup({ titles: [title('a')], sections: [sec('popular', 0)] });
    await service.rows();
    await service.preview();
    await service.sectionsWithCounts();
    expect(prisma.catalogueTitle.findMany).toHaveBeenCalledTimes(1);

    jest.setSystemTime(NOW.getTime() + HOME_CACHE_TTL_MS - 1);
    await service.rows();
    expect(prisma.catalogueTitle.findMany).toHaveBeenCalledTimes(1);

    jest.setSystemTime(NOW.getTime() + HOME_CACHE_TTL_MS + 1);
    await service.rows();
    expect(prisma.catalogueTitle.findMany).toHaveBeenCalledTimes(2);

    service.invalidate();
    await service.rows();
    expect(prisma.catalogueTitle.findMany).toHaveBeenCalledTimes(3);
  });

  it('does not cache a failed computation', async () => {
    const { service, prisma } = setup({ titles: [title('a')], sections: [sec('popular', 0)] });
    prisma.homepageSection.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(service.rows()).rejects.toThrow('db down');
    expect(await service.rows()).toHaveLength(1);
  });

  it('placementFor lists matching enabled RULE sections with base-eligibility reasons', async () => {
    const draft = title('d', {
      status: 'DRAFT',
      genreLinks: [genre('horror-supernatural')],
    });
    const { service, prisma } = setup({
      titles: [draft, title('n', { videoKey: null }), title('ok')],
      sections: [
        sec('horror', 0, { rules: { genresAny: ['horror'] } }),
        sec('comedy', 1, { rules: { genresAny: ['comedy'] } }),
        sec('off', 2, { enabled: false }),
        sec('cw', 3, { kind: 'CONTINUE_WATCHING' }),
        sec('all', 4, { excludedTitleIds: ['ok'] }),
        sec('pinned', 5, { rules: { genresAny: ['comedy'] }, pinnedTitleIds: ['ok'] }),
        sec('broken', 6, { rules: { bad: true } }),
      ],
    });
    expect(await service.placementFor('d')).toEqual([
      { slug: 'horror', title: 'HORROR', eligible: false, reason: 'Not published' },
      { slug: 'all', title: 'ALL', eligible: false, reason: 'Not published' },
    ]);
    expect(prisma.catalogueTitle.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: 'd' } }),
    );
    expect(await service.placementFor('n')).toEqual([
      { slug: 'all', title: 'ALL', eligible: false, reason: 'No video yet' },
    ]);
    expect(await service.placementFor('ok')).toEqual([
      { slug: 'all', title: 'ALL', eligible: false, reason: 'Excluded from this section' },
      { slug: 'pinned', title: 'PINNED', eligible: true },
    ]);
    expect(await service.placementFor('missing')).toEqual([]);
  });

  it('placementFor reports the rights window', async () => {
    const { service } = setup({
      titles: [title('x', { availableUntil: new Date('2026-10-01T00:00:00Z') })],
      sections: [sec('all', 0)],
    });
    expect(await service.placementFor('x')).toEqual([
      { slug: 'all', title: 'ALL', eligible: false, reason: 'Outside its availability window' },
    ]);
  });

  it('uses effective values: series playable via episodes, derived access/format/release', async () => {
    const { service } = setup({
      titles: [
        title('s1', { type: 'SERIES', videoKey: null }),
        title('s2', { type: 'SERIES', videoKey: null }),
        title('paid', { priceMinor: 500, year: 1999 }),
      ],
      episodes: [{ titleId: 's1', createdAt: new Date('2026-10-26T00:00:00Z') }],
      sections: [
        sec('eps', 0, {
          sort: 'LATEST_EPISODE',
          rules: { types: ['series'], hasEpisodeWithinDays: 30 },
        }),
        sec('ppv', 1, { rules: { accessAny: ['PAY_PER_VIEW'], formats: ['FEATURE_FILM'] } }),
        sec('old', 2, { rules: { releaseYearMax: 2000 } }),
        sec('tv', 3, { rules: { formats: ['TV_SERIES'] } }),
      ],
    });
    const rows = await service.rows();
    expect(rows.map((r) => [r.slug, r.items.map((i) => i.id)])).toEqual([
      ['eps', ['s1']],
      ['ppv', ['paid']],
      ['old', ['paid']],
      ['tv', ['s1']],
    ]);
  });
});
