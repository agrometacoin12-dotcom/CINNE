import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClassificationService } from './classification.service';

const TITLE_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

interface Row {
  id: string;
  slug: string;
  name: string;
  position: number;
  [k: string]: unknown;
}

const genres: (Row & { parentId: string | null })[] = [
  { id: 'g-drama', slug: 'drama', name: 'Drama', parentId: null, position: 3 },
  { id: 'g-horror', slug: 'horror', name: 'Horror', parentId: null, position: 5 },
  { id: 'g-thriller', slug: 'thriller', name: 'Thriller', parentId: null, position: 6 },
  { id: 'g-scifi', slug: 'science-fiction', name: 'Science Fiction', parentId: null, position: 7 },
  {
    id: 'g-faith',
    slug: 'faith-spirituality',
    name: 'Faith & Spirituality',
    parentId: null,
    position: 20,
  },
  {
    id: 'g-horror-psych',
    slug: 'horror-psychological',
    name: 'Psychological',
    parentId: 'g-horror',
    position: 2,
  },
];
const tags: Row[] = [
  { id: 't-dark', slug: 'dark', name: 'Dark', kind: 'MOOD', position: 2 },
  { id: 't-revenge', slug: 'revenge', name: 'Revenge', kind: 'THEME', position: 1 },
];
const collections: Row[] = [
  {
    id: 'c-editors',
    slug: 'editors-picks',
    name: "Editor's Picks",
    kind: 'EDITORIAL',
    position: 0,
  },
  { id: 'c-new', slug: 'new-listings', name: 'New Listings', kind: 'SYSTEM', position: 9 },
  { id: 'c-trending', slug: 'trending', name: 'Trending now', kind: 'SYSTEM', position: 10 },
];
const industries: (Row & { countries: string[]; languages: string[] })[] = [
  {
    id: 'i-nolly',
    slug: 'nollywood',
    name: 'Nollywood',
    position: 0,
    countries: ['NG'],
    languages: [],
  },
  {
    id: 'i-ghally',
    slug: 'ghallywood',
    name: 'Ghallywood',
    position: 1,
    countries: ['GH'],
    languages: [],
  },
  {
    id: 'i-holly',
    slug: 'hollywood',
    name: 'Hollywood',
    position: 3,
    countries: ['US'],
    languages: [],
  },
  {
    id: 'i-kanny',
    slug: 'kannywood',
    name: 'Kannywood',
    position: 4,
    countries: ['NG'],
    languages: ['ha'],
  },
  {
    id: 'i-yoruba',
    slug: 'yoruba-cinema',
    name: 'Yoruba Cinema',
    position: 5,
    countries: [],
    languages: ['yo'],
  },
  {
    id: 'i-africa',
    slug: 'african-cinema',
    name: 'African Cinema',
    position: 8,
    countries: ['NG', 'GH'],
    languages: [],
  },
  {
    id: 'i-intl',
    slug: 'international-cinema',
    name: 'International Cinema',
    position: 15,
    countries: [],
    languages: [],
  },
];

type Where = Record<string, unknown>;

/** Filter by `{ slug: { in } }`, `{ id: { in } }` or nothing. */
function pick<T extends { id: string; slug: string }>(rows: T[], where?: Where): T[] {
  if (!where) return rows;
  const slugIn = (where.slug as { in?: string[] } | undefined)?.in;
  const idIn = (where.id as { in?: string[] } | undefined)?.in;
  return rows.filter((r) => (!slugIn || slugIn.includes(r.slug)) && (!idIn || idIn.includes(r.id)));
}

function build(overrides: { title?: Record<string, unknown> | null } = {}) {
  const title: Record<string, unknown> | null =
    overrides.title === null
      ? null
      : {
          id: TITLE_ID,
          type: 'MOVIE',
          priceMinor: 0,
          genres: [],
          categories: ['new-listings'],
          contentFormat: null,
          audience: null,
          ageRating: null,
          ratingJurisdiction: null,
          releaseDate: null,
          accessType: null,
          productionCountries: [],
          originalLanguages: [],
          audioLanguages: [],
          availableFrom: null,
          availableUntil: null,
          seriesComplete: false,
          ...overrides.title,
        };
  const links = {
    genres: [] as { titleId: string; genreId: string; position: number }[],
    tags: [] as { titleId: string; tagId: string }[],
    industries: [] as { titleId: string; industryId: string; source: 'MANUAL' | 'AUTO' }[],
    collections: [] as { titleId: string; collectionId: string; position: number; addedAt: Date }[],
  };

  const prisma = {
    genre: { findMany: jest.fn(async (a: { where?: Where } = {}) => pick(genres, a.where)) },
    tag: { findMany: jest.fn(async (a: { where?: Where } = {}) => pick(tags, a.where)) },
    collection: {
      findMany: jest.fn(async (a: { where?: Where } = {}) => pick(collections, a.where)),
    },
    industry: {
      findMany: jest.fn(async (a: { where?: Where } = {}) => pick(industries, a.where)),
    },
    catalogueTitle: {
      findUnique: jest.fn(async (a: { where: { id: string }; include?: unknown }) => {
        if (!title || a.where.id !== title.id) return null;
        if (!a.include) return { ...title };
        return {
          ...title,
          genreLinks: [...links.genres]
            .sort((x, y) => x.position - y.position)
            .map((l) => ({ ...l, genre: genres.find((g) => g.id === l.genreId) })),
          tagLinks: links.tags.map((l) => ({ ...l, tag: tags.find((t) => t.id === l.tagId) })),
          industryLinks: links.industries.map((l) => ({
            ...l,
            industry: industries.find((i) => i.id === l.industryId),
          })),
          collectionLinks: links.collections.map((l) => ({
            ...l,
            collection: collections.find((c) => c.id === l.collectionId),
          })),
        };
      }),
      update: jest.fn(async (a: { data: Record<string, unknown> }) => {
        Object.assign(title as object, a.data);
        return title;
      }),
    },
    titleGenre: {
      findMany: jest.fn(async () => [...links.genres].sort((x, y) => x.position - y.position)),
      deleteMany: jest.fn(async () => {
        links.genres = [];
      }),
      createMany: jest.fn(async (a: { data: typeof links.genres }) => {
        links.genres.push(...a.data);
      }),
    },
    titleTag: {
      deleteMany: jest.fn(async () => {
        links.tags = [];
      }),
      createMany: jest.fn(async (a: { data: typeof links.tags }) => {
        links.tags.push(...a.data);
      }),
    },
    titleIndustry: {
      deleteMany: jest.fn(async (a: { where: { source?: string } }) => {
        links.industries = links.industries.filter(
          (l) => a.where.source !== undefined && l.source !== a.where.source,
        );
      }),
      createMany: jest.fn(
        async (a: { data: typeof links.industries; skipDuplicates?: boolean }) => {
          for (const row of a.data) {
            if (links.industries.some((l) => l.industryId === row.industryId)) {
              if (!a.skipDuplicates) throw new Error('duplicate');
              continue;
            }
            links.industries.push(row);
          }
        },
      ),
    },
    titleCollection: {
      deleteMany: jest.fn(async (a: { where: { collectionId?: { notIn: string[] } } }) => {
        const keep = a.where.collectionId?.notIn ?? [];
        links.collections = links.collections.filter((l) => keep.includes(l.collectionId));
      }),
      createMany: jest.fn(
        async (a: {
          data: { titleId: string; collectionId: string }[];
          skipDuplicates?: boolean;
        }) => {
          for (const row of a.data) {
            if (links.collections.some((l) => l.collectionId === row.collectionId)) continue;
            links.collections.push({ ...row, position: 0, addedAt: new Date() });
          }
        },
      ),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma),
  );
  const audit = { record: jest.fn(async () => undefined) };
  const placement = [
    { slug: 'newly-added', title: 'Newly Added', eligible: false, reason: 'Not published' },
  ];
  const home = {
    placementFor: jest.fn(async () => placement),
    invalidate: jest.fn(),
  };
  const service = new ClassificationService(prisma as never, audit as never, home as never);
  return { service, prisma, audit, home, title, links, placement };
}

describe('ClassificationService', () => {
  describe('validation', () => {
    it('400s naming every unknown slug and writes nothing', async () => {
      const { service, prisma, audit } = build();

      const err = await service
        .update(
          TITLE_ID,
          { genres: ['drama', 'nope'], tags: ['dark', 'meh'], industries: ['bogus'] },
          ADMIN_ID,
        )
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      const msg = (err as BadRequestException).message;
      expect(msg).toContain('genres: nope');
      expect(msg).toContain('tags: meh');
      expect(msg).toContain('industries: bogus');
      expect(msg).not.toContain('drama');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('400s when availableUntil is not after availableFrom (incl. the stored value)', async () => {
      const { service } = build({ title: { availableFrom: new Date('2026-06-01T00:00:00Z') } });
      await expect(
        service.update(TITLE_ID, { availableUntil: '2026-05-01T00:00:00Z' }, ADMIN_ID),
      ).rejects.toThrow('availableUntil must be after availableFrom');
      await expect(
        service.update(
          TITLE_ID,
          { availableFrom: '2026-01-01T00:00:00Z', availableUntil: '2026-01-01T00:00:00Z' },
          ADMIN_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400s on an impossible release date and bad codes', async () => {
      const { service } = build();
      await expect(
        service.update(TITLE_ID, { releaseDate: '2026-02-30' }, ADMIN_ID),
      ).rejects.toThrow('releaseDate');
      await expect(
        service.update(TITLE_ID, { productionCountries: ['NGA'] }, ADMIN_ID),
      ).rejects.toThrow('Invalid country codes: NGA');
    });

    it('404s an unknown title', async () => {
      const { service } = build({ title: null });
      await expect(service.update(TITLE_ID, {}, ADMIN_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.get(TITLE_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('writes', () => {
    it('replaces join rows, mirrors legacy columns, audits and invalidates the home cache', async () => {
      const { service, title, links, audit, home } = build();

      const dto = await service.update(
        TITLE_ID,
        {
          genres: ['horror-psychological', 'thriller', 'horror', 'thriller'],
          tags: ['revenge', 'dark'],
          collections: ['editors-picks'],
          releaseDate: '2024-03-15',
          accessType: 'RENTAL',
          contentFormat: 'SHORT_FILM',
        },
        ADMIN_ID,
      );

      expect(links.genres.map((l) => [l.genreId, l.position])).toEqual([
        ['g-horror-psych', 0],
        ['g-thriller', 1],
        ['g-horror', 2],
      ]);
      // Subgenre contributes its parent's name; deduplicated, in order.
      expect(title?.genres).toEqual(['Horror', 'Thriller']);
      expect(title?.categories).toEqual(['editors-picks', 'new-listings']);
      expect(title?.releaseDate).toEqual(new Date('2024-03-15T00:00:00Z'));

      expect(dto.genres).toEqual(['horror-psychological', 'thriller', 'horror']);
      expect(dto.tags).toEqual(['dark', 'revenge']); // MOOD before THEME
      expect(dto.collections).toEqual(['editors-picks']);
      expect(dto.releaseDate).toBe('2024-03-15');
      expect(dto.effectiveFormat).toBe('SHORT_FILM');
      expect(dto.effectiveAccess).toBe('RENTAL');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'admin.title.classify',
          actorId: ADMIN_ID,
          entityId: TITLE_ID,
        }),
      );
      expect(home.invalidate).toHaveBeenCalled();
    });

    it('leaves lists that were not given untouched and clears nullable fields with null', async () => {
      const { service, title, links } = build({ title: { audience: 'KIDS', genres: ['Legacy'] } });
      links.genres.push({ titleId: TITLE_ID, genreId: 'g-drama', position: 0 });

      await service.update(TITLE_ID, { audience: null, ageRating: '18' }, ADMIN_ID);

      expect(title?.audience).toBeNull();
      expect(title?.ageRating).toBe('18');
      expect(title?.genres).toEqual(['Legacy']);
      expect(links.genres).toHaveLength(1);
    });

    it('recomputes AUTO industries from countries/languages and keeps MANUAL ones', async () => {
      const { service, title, links } = build();
      links.industries.push(
        { titleId: TITLE_ID, industryId: 'i-holly', source: 'MANUAL' },
        { titleId: TITLE_ID, industryId: 'i-ghally', source: 'AUTO' },
      );

      const dto = await service.update(
        TITLE_ID,
        { productionCountries: ['ng', 'NG'], originalLanguages: ['YO'] },
        ADMIN_ID,
      );

      expect(title?.productionCountries).toEqual(['NG']);
      expect(title?.originalLanguages).toEqual(['yo']);
      expect(dto.industries).toEqual([
        { slug: 'nollywood', name: 'Nollywood', source: 'auto' },
        { slug: 'hollywood', name: 'Hollywood', source: 'manual' },
        { slug: 'yoruba-cinema', name: 'Yoruba Cinema', source: 'auto' },
        { slug: 'african-cinema', name: 'African Cinema', source: 'auto' },
      ]);
    });

    it('a MANUAL pick replaces manual rows and wins over the AUTO match for the same industry', async () => {
      const { service, links } = build({ title: { productionCountries: ['NG'] } });
      links.industries.push({ titleId: TITLE_ID, industryId: 'i-holly', source: 'MANUAL' });

      const dto = await service.update(TITLE_ID, { industries: ['nollywood'] }, ADMIN_ID);

      expect(dto.industries).toEqual([
        { slug: 'nollywood', name: 'Nollywood', source: 'manual' },
        { slug: 'african-cinema', name: 'African Cinema', source: 'auto' },
      ]);
    });

    it('falls back to international-cinema when nothing else matches', async () => {
      const { service } = build();
      const dto = await service.update(TITLE_ID, { productionCountries: ['FR'] }, ADMIN_ID);
      expect(dto.industries.map((i) => [i.slug, i.source])).toEqual([
        ['international-cinema', 'auto'],
      ]);
    });
  });

  describe('get', () => {
    it('returns effective values and the placement from HomeService', async () => {
      const { service, home, placement } = build({ title: { type: 'SERIES', priceMinor: 5000 } });
      const dto = await service.get(TITLE_ID);
      expect(dto.type).toBe('series');
      expect(dto.effectiveFormat).toBe('TV_SERIES');
      expect(dto.effectiveAccess).toBe('PAY_PER_VIEW');
      expect(dto.placement).toBe(placement);
      expect(home.placementFor).toHaveBeenCalledWith(TITLE_ID);
    });
  });

  describe('syncLegacy', () => {
    it('matches names/slugs case-insensitively to top-level genres and ignores unknown names', async () => {
      const { service, links, title, home } = build({ title: { genres: ['keep me'] } });

      await service.syncLegacy(TITLE_ID, {
        genres: ['DRAMA', 'science fiction', 'faith & spirituality', 'Psychological', 'Unknown'],
      });

      expect(links.genres.map((l) => l.genreId)).toEqual(['g-drama', 'g-scifi', 'g-faith']);
      // The legacy column is not rewritten.
      expect(title?.genres).toEqual(['keep me']);
      expect(home.invalidate).toHaveBeenCalled();
    });

    it('keeps subgenre picks under a parent that is still selected, drops the rest', async () => {
      const { service, links } = build();
      links.genres.push(
        { titleId: TITLE_ID, genreId: 'g-horror-psych', position: 0 },
        { titleId: TITLE_ID, genreId: 'g-drama', position: 1 },
      );

      await service.syncLegacy(TITLE_ID, { genres: ['Horror', 'Thriller'] });

      expect(links.genres.map((l) => [l.genreId, l.position])).toEqual([
        ['g-horror-psych', 0],
        ['g-thriller', 1],
      ]);
    });

    it('replaces collections with the category slugs that exist, keeping addedAt of kept rows', async () => {
      const { service, links } = build();
      const addedAt = new Date('2025-01-01T00:00:00Z');
      links.collections.push(
        { titleId: TITLE_ID, collectionId: 'c-trending', position: 3, addedAt },
        { titleId: TITLE_ID, collectionId: 'c-editors', position: 0, addedAt },
      );

      await service.syncLegacy(TITLE_ID, { categories: ['trending', 'bogus', 'new-listings'] });

      expect(links.collections.map((l) => l.collectionId).sort()).toEqual(['c-new', 'c-trending']);
      expect(links.collections.find((l) => l.collectionId === 'c-trending')).toMatchObject({
        position: 3,
        addedAt,
      });
    });

    it('is a no-op for a title that is not in Postgres', async () => {
      const { service, prisma } = build({ title: null });
      await service.syncLegacy(TITLE_ID, { genres: ['Drama'] });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it('taxonomy nests subgenres under their parent and includes the fixed choices', async () => {
    const { service } = build();
    const t = await service.taxonomy();
    expect(t.genres.find((g) => g.slug === 'horror')?.subgenres).toEqual([
      { slug: 'horror-psychological', name: 'Psychological' },
    ]);
    expect(t.genres.some((g) => g.slug === 'horror-psychological')).toBe(false);
    expect(t.formats).toHaveLength(15);
    expect(t.audiences.map((a) => a.value)).toEqual(['KIDS', 'TEENS', 'FAMILY', 'ADULTS']);
    expect(t.accessTypes).toHaveLength(6);
    expect(t.languages).toContainEqual({ code: 'pcm', name: 'Nigerian Pidgin' });
    expect(t.decades[0]).toBe('1970s');
  });
});
