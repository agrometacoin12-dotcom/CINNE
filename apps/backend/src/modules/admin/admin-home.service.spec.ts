import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminHomeService } from './admin-home.service';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const S1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const S2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const S3 = 'aaaaaaaa-0000-0000-0000-000000000003';
const T1 = 'bbbbbbbb-0000-0000-0000-000000000001';
const T2 = 'bbbbbbbb-0000-0000-0000-000000000002';
const MISSING = 'bbbbbbbb-0000-0000-0000-00000000dead';

const section = (id: string, slug: string, position: number, extra: object = {}) => ({
  id,
  slug,
  title: slug,
  kind: 'RULE',
  rules: {},
  sort: 'POPULARITY',
  limit: 20,
  minItems: 4,
  enabled: true,
  position,
  pinnedTitleIds: [] as string[],
  excludedTitleIds: [] as string[],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...extra,
});

function build() {
  const sections = [
    section(S1, 'newly-added', 0),
    section(S2, 'continue-watching', 1, { kind: 'CONTINUE_WATCHING' }),
    section(S3, 'popular', 2),
  ];
  const prisma = {
    homepageSection: {
      findMany: jest.fn(async () => [...sections].sort((a, b) => a.position - b.position)),
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          sections.find((s) => s.id === where.id) ?? null,
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const s = sections.find((x) => x.id === where.id);
          Object.assign(s as object, data);
          return s;
        },
      ),
    },
    catalogueTitle: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        [T1, T2].filter((id) => where.id.in.includes(id)).map((id) => ({ id })),
      ),
    },
    collection: {
      findUnique: jest.fn(async ({ where }: { where: { slug: string } }) =>
        where.slug === 'editors-picks'
          ? {
              id: 'c1',
              slug: 'editors-picks',
              name: "Editor's Picks",
              kind: 'EDITORIAL',
              description: null,
            }
          : null,
      ),
      aggregate: jest.fn(async () => ({ _max: { position: 15 } })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'c-new',
        ...data,
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'c1',
        slug: 'editors-picks',
        name: "Editor's Picks",
        kind: 'EDITORIAL',
        description: null,
        ...data,
      })),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const audit = { record: jest.fn(async () => undefined) };
  const home = {
    sectionsWithCounts: jest.fn(
      async () =>
        new Map([
          [S1, { eligibleCount: 7, live: true }],
          [S2, { eligibleCount: null, live: false }],
        ]),
    ),
    preview: jest.fn(async () => ({ rows: [], hidden: [] })),
    invalidate: jest.fn(),
  };
  const service = new AdminHomeService(prisma as never, audit as never, home as never);
  return { service, prisma, audit, home, sections };
}

describe('AdminHomeService', () => {
  it('lists sections in position order with counts', async () => {
    const { service } = build();
    const list = await service.listSections();
    expect(list.map((s) => [s.slug, s.eligibleCount, s.live])).toEqual([
      ['newly-added', 7, true],
      ['continue-watching', null, false],
      ['popular', null, false],
    ]);
  });

  describe('updateSection', () => {
    it('validates rules with parseSectionRules (400 on unknown keys)', async () => {
      const { service, prisma } = build();
      await expect(
        service.updateSection(S1, { rules: { genresAny: ['drama'], bogusKey: 1 } }, ADMIN_ID),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateSection(S1, { rules: { minPlays7d: 'lots' } }, ADMIN_ID),
      ).rejects.toThrow(/Invalid rules/);
      expect(prisma.homepageSection.update).not.toHaveBeenCalled();
    });

    it('400s on unknown pinned/excluded title ids and on overlap', async () => {
      const { service } = build();
      await expect(
        service.updateSection(S1, { pinnedTitleIds: [T1, MISSING] }, ADMIN_ID),
      ).rejects.toThrow(`Unknown title ids: ${MISSING}`);
      await expect(
        service.updateSection(S1, { pinnedTitleIds: [T1], excludedTitleIds: [T1] }, ADMIN_ID),
      ).rejects.toThrow(/both pinned and excluded/);
    });

    it('400s on limit/minItems outside 1–50', async () => {
      const { service } = build();
      await expect(service.updateSection(S1, { limit: 0 }, ADMIN_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updateSection(S1, { minItems: 51 }, ADMIN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('404s an unknown section', async () => {
      const { service } = build();
      await expect(service.updateSection(MISSING, { enabled: false }, ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('applies a valid patch, audits and invalidates the browse cache', async () => {
      const { service, prisma, audit, home } = build();

      const dto = await service.updateSection(
        S1,
        {
          title: ' Fresh ',
          enabled: false,
          sort: 'PLAYS_7D',
          limit: 10,
          rules: { genresAny: ['drama'] },
          pinnedTitleIds: [T2, T1, T2],
        },
        ADMIN_ID,
      );

      expect(prisma.homepageSection.update).toHaveBeenCalledWith({
        where: { id: S1 },
        data: expect.objectContaining({
          title: 'Fresh',
          enabled: false,
          sort: 'PLAYS_7D',
          limit: 10,
          rules: expect.objectContaining({ genresAny: ['drama'] }),
          pinnedTitleIds: [T2, T1],
        }),
      });
      expect(dto).toMatchObject({ id: S1, title: 'Fresh', eligibleCount: 7, live: true });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin.home-section.update', entityId: S1 }),
      );
      expect(home.invalidate).toHaveBeenCalled();
    });
  });

  describe('reorderSections', () => {
    it('requires every section id exactly once', async () => {
      const { service, prisma } = build();
      await expect(service.reorderSections([S1, S2], ADMIN_ID)).rejects.toThrow(
        `Missing section ids: ${S3}`,
      );
      await expect(service.reorderSections([S1, S2, S3, MISSING], ADMIN_ID)).rejects.toThrow(
        `Unknown section ids: ${MISSING}`,
      );
      await expect(service.reorderSections([S1, S1, S2, S3], ADMIN_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('writes positions in the given order', async () => {
      const { service, audit, home } = build();
      const list = await service.reorderSections([S3, S1, S2], ADMIN_ID);
      expect(list.map((s) => s.id)).toEqual([S3, S1, S2]);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin.home-section.reorder' }),
      );
      expect(home.invalidate).toHaveBeenCalled();
    });
  });

  describe('collections', () => {
    it('creates an EDITORIAL collection at the end', async () => {
      const { service, prisma, audit, home } = build();
      const c = await service.createCollection(
        { slug: 'nollywood-classics', name: ' Nollywood Classics ' },
        ADMIN_ID,
      );
      expect(prisma.collection.create).toHaveBeenCalledWith({
        data: {
          slug: 'nollywood-classics',
          name: 'Nollywood Classics',
          kind: 'EDITORIAL',
          description: null,
          position: 16,
        },
      });
      expect(c).toEqual({
        slug: 'nollywood-classics',
        name: 'Nollywood Classics',
        kind: 'EDITORIAL',
        description: null,
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin.collection.create' }),
      );
      expect(home.invalidate).toHaveBeenCalled();
    });

    it('409s a duplicate slug', async () => {
      const { service } = build();
      await expect(
        service.createCollection({ slug: 'editors-picks', name: 'Again' }, ADMIN_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('updates name/description and 404s unknown slugs', async () => {
      const { service, audit } = build();
      const c = await service.updateCollection(
        'editors-picks',
        { description: 'Hand-picked' },
        ADMIN_ID,
      );
      expect(c.description).toBe('Hand-picked');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'admin.collection.update' }),
      );
      await expect(service.updateCollection('nope', { name: 'x' }, ADMIN_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
