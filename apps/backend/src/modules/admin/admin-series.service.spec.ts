import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AdminSeriesService } from './admin-series.service';
import type { Title } from '../catalogue/domain/title.entity';
import type { UpdateSeriesDto } from './dto/admin-series.dto';

const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const SERIES_ID = '22222222-2222-2222-2222-222222222222';
const SEASON_ID = '44444444-4444-4444-4444-444444444444';

/** UpdateSeriesDto is a partial update at runtime; relax the compile-time shape. */
const dto = (d: Partial<UpdateSeriesDto>) => d as UpdateSeriesDto;

const baseSeries: Title = {
  id: SERIES_ID,
  type: 'series',
  title: 'Temple Lines',
  tagline: null,
  overview: 'A Lagos dynasty drama.',
  year: 2026,
  genres: ['drama'],
  runtimeMinutes: null,
  seasons: 1,
  maturityRating: null,
  rating: 0,
  posterKey: null,
  heroKey: null,
  cast: [],
  director: null,
  categories: ['new-listings'],
  popularity: 50,
  featured: false,
  status: 'draft',
  priceMinor: 150000,
  currency: 'NGN',
  videoKey: null,
  trailerKey: null,
  durationSeconds: null,
  isPremiere: false,
  premiereStartAt: null,
};

function build(overrides: { existing?: Title | null; playableEpisodes?: number } = {}) {
  const existing = overrides.existing === undefined ? { ...baseSeries } : overrides.existing;

  const catalogue = {
    findRaw: jest.fn(async () => existing),
    adminGet: jest.fn(async () => ({ ...baseSeries })),
    createTitle: jest.fn(async (t: Title) => ({ ...t })),
    updateTitle: jest.fn(async (_id: string, patch: Partial<Title>) => ({
      ...baseSeries,
      ...patch,
    })),
    deleteTitle: jest.fn(async () => undefined),
    setFeatured: jest.fn(async () => undefined),
  };
  const media = { publicUrl: jest.fn((key: string) => `https://cdn.test/${key}`) };
  const audit = { record: jest.fn(async () => undefined) };
  const events = { publish: jest.fn(async () => undefined) };
  const classification = { syncLegacy: jest.fn(async () => undefined) };

  const seasonRows: { id: string; titleId: string; number: number }[] = [
    { id: SEASON_ID, titleId: SERIES_ID, number: 1 },
  ];
  const prisma = {
    catalogueTitle: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
    season: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'season-new',
        ...data,
      })),
      findUnique: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          seasonRows.find((s) => s.id === where.id) ?? null,
      ),
      findMany: jest.fn(async () => []),
      update: jest.fn(),
      delete: jest.fn(async () => undefined),
      count: jest.fn(async () => seasonRows.length),
    },
    episode: {
      count: jest.fn(async () => overrides.playableEpisodes ?? 0),
      groupBy: jest.fn(async () => []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'episode-new',
        overview: null,
        runtimeMinutes: null,
        durationSeconds: null,
        videoKey: null,
        stillKey: null,
        ...data,
      })),
      findUnique: jest.fn(async () => null),
      update: jest.fn(),
      delete: jest.fn(async () => undefined),
    },
    purchase: { count: jest.fn(async () => 0) },
    $queryRaw: jest.fn(async () => [{status: overrides.existing?.status === 'published' ? 'PUBLISHED' : 'DRAFT'}]),
    $transaction: jest.fn(async (ops: any): Promise<any> => typeof ops === 'function' ? ops(prisma) : Promise.all(ops)),
  };
  const config = { get: () => 'NGN' } as unknown as ConfigService;

  const service = new AdminSeriesService(
    catalogue as never,
    media as never,
    audit as never,
    events as never,
    prisma as never,
    config,
    classification as never,
  );
  return { service, catalogue, prisma, audit, classification };
}

describe('AdminSeriesService', () => {
  it('creates a DRAFT series with the new-listings category', async () => {
    const { service, catalogue, audit } = build();

    await service.create(
      { title: 'Temple Lines', overview: 'x', year: 2026, genres: ['drama'], priceMinor: 150000 },
      ADMIN_ID,
    );

    const created = catalogue.createTitle.mock.calls[0]?.[0] as Title;
    expect(created.type).toBe('series');
    expect(created.status).toBe('draft');
    expect(created.categories).toContain('new-listings');
    expect(created.seasons).toBe(0);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.series.create', actorId: ADMIN_ID }),
    );
  });

  it('REFUSES to publish a series with no playable episode (422)', async () => {
    const { service, catalogue } = build({ playableEpisodes: 0 });

    await expect(service.update(SERIES_ID, dto({ status: 'published' }), ADMIN_ID)).rejects.toThrow(
      UnprocessableEntityException,
    );
    expect(catalogue.updateTitle).not.toHaveBeenCalled();
  });

  it('publishes once at least one episode has a video', async () => {
    const { service, catalogue, prisma } = build({ playableEpisodes: 1 });

    await service.update(SERIES_ID, dto({ status: 'published' }), ADMIN_ID);

    expect(prisma.episode.count).toHaveBeenCalledWith({
      where: { titleId: SERIES_ID, videoKey: { not: null } },
    });
    expect(catalogue.updateTitle).toHaveBeenCalledWith(
      SERIES_ID,
      expect.objectContaining({ status: 'published' }),
    );
  });

  it('syncs legacy genres/categories on create', async () => {
    const { service, classification } = build();

    const created = await service.create(
      { title: 'T', overview: 'x', year: 2026, genres: ['Drama'], priceMinor: 0 },
      ADMIN_ID,
    );

    expect(classification.syncLegacy).toHaveBeenCalledWith(created.id, {
      genres: ['Drama'],
      categories: ['new-listings'],
    });
  });

  it('syncs on update only when genres/categories change', async () => {
    const { service, classification } = build();

    await service.update(SERIES_ID, dto({ title: 'Renamed' }), ADMIN_ID);
    expect(classification.syncLegacy).not.toHaveBeenCalled();

    await service.update(SERIES_ID, dto({ categories: ['trending'] }), ADMIN_ID);
    expect(classification.syncLegacy).toHaveBeenCalledWith(SERIES_ID, {
      genres: undefined,
      categories: ['trending', 'new-listings'],
    });
  });

  it('sets publishedAt on first publish only', async () => {
    const first = build({ playableEpisodes: 1 });
    await first.service.update(SERIES_ID, dto({ status: 'published' }), ADMIN_ID);
    expect(first.catalogue.updateTitle.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ status: 'published', publishedAt: expect.any(String) }),
    );

    const again = build({
      playableEpisodes: 1,
      existing: { ...baseSeries, publishedAt: '2026-01-01T00:00:00.000Z' },
    });
    await again.service.update(SERIES_ID, dto({ status: 'published' }), ADMIN_ID);
    expect(again.catalogue.updateTitle.mock.calls[0]?.[1]).not.toHaveProperty('publishedAt');
  });

  it('404s series operations on a movie id', async () => {
    const { service } = build({ existing: { ...baseSeries, type: 'movie' } });
    await expect(service.get(SERIES_ID)).rejects.toThrow(new NotFoundException('Series not found'));
  });

  it('maintains the derived season count on season create', async () => {
    const { service, catalogue, prisma } = build();

    await service.createSeason(SERIES_ID, { number: 2 }, ADMIN_ID);

    expect(prisma.season.count).toHaveBeenCalledWith({ where: { titleId: SERIES_ID } });
    expect(catalogue.updateTitle).toHaveBeenCalledWith(SERIES_ID, { seasons: 1 });
  });

  it('maintains the derived season count on season delete', async () => {
    const { service, catalogue, prisma } = build();

    await service.deleteSeason(SEASON_ID, ADMIN_ID);

    expect(prisma.season.delete).toHaveBeenCalledWith({ where: { id: SEASON_ID } });
    expect(catalogue.updateTitle).toHaveBeenCalledWith(SERIES_ID, { seasons: 1 });
  });

  it('denormalizes titleId onto created episodes and defaults duration from runtime', async () => {
    const { service, prisma } = build();

    const episode = await service.createEpisode(
      SEASON_ID,
      { number: 1, name: 'Pilot', runtimeMinutes: 45 },
      ADMIN_ID,
    );

    const args = prisma.episode.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data.titleId).toBe(SERIES_ID);
    expect(args.data.durationSeconds).toBe(45 * 60);
    expect(episode.hasVideo).toBe(false);
  });

  it('maps a duplicate season number to 409', async () => {
    const { service, prisma } = build();
    const { Prisma } = jest.requireActual('@prisma/client') as typeof import('@prisma/client');
    prisma.season.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.createSeason(SERIES_ID, { number: 1 }, ADMIN_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  describe('episode edits', () => {
    const EPISODE_ID = '55555555-5555-5555-5555-555555555555';
    const row = (overrides: Record<string, unknown> = {}) => ({
      id: EPISODE_ID,
      seasonId: SEASON_ID,
      titleId: SERIES_ID,
      number: 1,
      name: 'Pilot',
      overview: null,
      runtimeMinutes: 30,
      durationSeconds: 1800,
      videoKey: 'originals/video/pilot.mp4',
      stillKey: null,
      ...overrides,
    });
    const setup = (opts: { status: 'draft' | 'published'; otherPlayable: number }) => {
      const built = build({
        existing: { ...baseSeries, status: opts.status },
        playableEpisodes: opts.otherPlayable,
      });
      built.prisma.episode.findUnique.mockResolvedValue(row() as never);
      built.prisma.episode.update.mockImplementation((async ({ data }: { data: object }) => ({
        ...row(),
        ...data,
      })) as never);
      return built;
    };

    it('keeps the viewing-window duration in step with an edited runtime', async () => {
      const { service, prisma } = setup({ status: 'draft', otherPlayable: 0 });

      await service.updateEpisode(EPISODE_ID, { runtimeMinutes: 50 } as never, ADMIN_ID);
      expect(prisma.episode.update).toHaveBeenLastCalledWith({
        where: { id: EPISODE_ID },
        data: { runtimeMinutes: 50, durationSeconds: 3000 },
      });

      await service.updateEpisode(
        EPISODE_ID,
        { runtimeMinutes: 50, durationSeconds: 2950 } as never,
        ADMIN_ID,
      );
      expect(prisma.episode.update).toHaveBeenLastCalledWith({
        where: { id: EPISODE_ID },
        data: { runtimeMinutes: 50, durationSeconds: 2950 },
      });
    });

    it('refuses to remove the last video of a published series (422)', async () => {
      const { service, prisma } = setup({ status: 'published', otherPlayable: 0 });

      await expect(
        service.updateEpisode(EPISODE_ID, { videoKey: null } as never, ADMIN_ID),
      ).rejects.toThrow(UnprocessableEntityException);
      await expect(service.deleteEpisode(EPISODE_ID, ADMIN_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
      await expect(service.deleteSeason(SEASON_ID, ADMIN_ID)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(prisma.episode.count).toHaveBeenCalledWith({
        where: { titleId: SERIES_ID, videoKey: { not: null }, NOT: { seasonId: SEASON_ID } },
      });
      expect(prisma.episode.update).not.toHaveBeenCalled();
      expect(prisma.episode.delete).not.toHaveBeenCalled();
      expect(prisma.season.delete).not.toHaveBeenCalled();
    });

    it('allows removing a video while another episode stays playable, or on a draft', async () => {
      const published = setup({ status: 'published', otherPlayable: 1 });
      await published.service.deleteEpisode(EPISODE_ID, ADMIN_ID);
      expect(published.prisma.episode.delete).toHaveBeenCalled();

      const draft = setup({ status: 'draft', otherPlayable: 0 });
      await draft.service.updateEpisode(EPISODE_ID, { videoKey: null } as never, ADMIN_ID);
      expect(draft.prisma.episode.update).toHaveBeenCalled();
    });
  });
});
