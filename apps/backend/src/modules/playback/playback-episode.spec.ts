import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlaybackService, type EpisodePlaybackSession } from './playback.service';

const USER = '11111111-1111-1111-1111-111111111111';
const SERIES = '22222222-2222-2222-2222-222222222222';
const EP1 = '33333333-3333-3333-3333-333333333331';
const EP2 = '33333333-3333-3333-3333-333333333332';

type EpisodeRow = {
  id: string;
  seasonId: string;
  titleId: string;
  number: number;
  name: string;
  overview: string | null;
  runtimeMinutes: number | null;
  durationSeconds: number | null;
  videoKey: string | null;
  stillKey: string | null;
};

type EpisodePlaybackRow = {
  id: string;
  userId: string;
  episodeId: string;
  titleId: string;
  positionSeconds: number;
  durationSeconds: number;
  startedAt: Date | null;
  expiresAt: Date | null;
  consumedAt: Date | null;
  updatedAt: Date;
};

const episode = (id: string, overrides: Partial<EpisodeRow> = {}): EpisodeRow => ({
  id,
  seasonId: '44444444-4444-4444-4444-444444444444',
  titleId: SERIES,
  number: 1,
  name: 'Pilot',
  overview: null,
  runtimeMinutes: null,
  durationSeconds: 1000,
  videoKey: `originals/video/${id}.mp4`,
  stillKey: null,
  ...overrides,
});

const playbackRow = (overrides: Partial<EpisodePlaybackRow> = {}): EpisodePlaybackRow => ({
  id: 'pb-1',
  userId: USER,
  episodeId: EP1,
  titleId: SERIES,
  positionSeconds: 0,
  durationSeconds: 1000,
  startedAt: null,
  expiresAt: null,
  consumedAt: null,
  updatedAt: new Date('2026-07-19T10:00:00Z'),
  ...overrides,
});

const seriesTitle = (overrides: Record<string, unknown> = {}) => ({
  id: SERIES,
  type: 'series',
  title: 'Temple Lines',
  status: 'published',
  videoKey: null,
  durationSeconds: null,
  runtimeMinutes: null,
  isPremiere: false,
  premiereStartAt: null,
  ...overrides,
});

function makeService(overrides?: {
  title?: Record<string, unknown> | null;
  episodes?: EpisodeRow[];
  existingPlayback?: EpisodePlaybackRow | null;
  usable?: boolean;
  /** Counts used by the all-episodes-consumed check: [playable, consumed]. */
  playableCount?: number;
  consumedCount?: number;
}) {
  const episodes = overrides?.episodes ?? [episode(EP1)];

  const findFirst = jest.fn(
    async ({ where }: { where: { id: string; titleId: string } }) =>
      episodes.find((e) => e.id === where.id && e.titleId === where.titleId) ?? null,
  );
  const episodeCount = jest.fn(async () => overrides?.playableCount ?? episodes.length);

  const findUnique = jest.fn(async () => overrides?.existingPlayback ?? null);
  const upsert = jest.fn(
    async ({ create, update }: { create: Partial<EpisodePlaybackRow>; update: unknown }) =>
      playbackRow({ ...create, ...(update as Partial<EpisodePlaybackRow>) }),
  );
  const updateMany = jest.fn(async () => ({ count: 1 }));
  const playbackCount = jest.fn(async () => overrides?.consumedCount ?? 0);

  const prisma = {
    episode: { findFirst, count: episodeCount },
    episodePlayback: { findUnique, upsert, updateMany, count: playbackCount },
    playbackProgress: {
      upsert: jest.fn(async () => {
        throw new Error('movie path must not be touched by episode calls');
      }),
    },
  } as never;

  const title = overrides?.title === undefined ? seriesTitle() : overrides.title;
  const catalogue = { findRaw: jest.fn(async () => title) } as never;
  const media = {
    playbackUrl: jest.fn((key: string) => `https://signed.test/${key}`),
    publicUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
  } as never;
  const consume = jest.fn(async () => {});
  const findUsable = jest.fn(async () =>
    (overrides?.usable ?? true) ? { id: 'ent-1', startedAt: null, expiresAt: null } : null,
  );
  const entitlements = { consume, findUsable } as never;
  const audit = { record: jest.fn(async () => undefined) } as never;

  const service = new PlaybackService(catalogue, entitlements, media, audit, prisma);
  return { service, findUnique, upsert, updateMany, consume, findUsable, episodeCount };
}

describe('PlaybackService — per-episode watch-once (series)', () => {
  it('starts an episode: checks the SERIES entitlement and opens a per-episode window', async () => {
    const { service, upsert, findUsable } = makeService();

    const session = (await service.start(
      { sub: USER, email: 'a@b.c' },
      SERIES,
      EP1,
    )) as EpisodePlaybackSession;

    expect(findUsable).toHaveBeenCalledWith(USER, SERIES);
    expect(session.episodeId).toBe(EP1);
    expect(session.url).toBe(`https://signed.test/originals/video/${EP1}.mp4`);
    expect(session.durationSeconds).toBe(1000);
    expect(session.sessionId).toBe('ent-1');
    expect(session.expiresAt).not.toBeNull();
    // First play stamps startedAt/expiresAt on the EpisodePlayback row.
    const args = upsert.mock.calls[0]?.[0] as {
      create: { startedAt: Date; expiresAt: Date; titleId: string };
    };
    expect(args.create.titleId).toBe(SERIES);
    expect(args.create.startedAt).toBeInstanceOf(Date);
    // Window = duration + 30-min pause grace.
    expect(args.create.expiresAt.getTime() - args.create.startedAt.getTime()).toBe(
      (1000 + 30 * 60) * 1000,
    );
  });

  it('refuses to start without a usable series entitlement', async () => {
    const { service } = makeService({ usable: false });
    await expect(service.start({ sub: USER, email: 'a@b.c' }, SERIES, EP1)).rejects.toThrow(
      new ForbiddenException('No active access to this title. Purchase to watch.'),
    );
  });

  it('refuses a SECOND watch: a consumed episode can never be streamed again', async () => {
    const { service, upsert } = makeService({
      existingPlayback: playbackRow({ consumedAt: new Date('2026-07-18T00:00:00Z') }),
    });
    await expect(service.start({ sub: USER, email: 'a@b.c' }, SERIES, EP1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses an episode whose viewing window has elapsed', async () => {
    const { service } = makeService({
      existingPlayback: playbackRow({
        startedAt: new Date(Date.now() - 7_200_000),
        expiresAt: new Date(Date.now() - 3_600_000),
      }),
    });
    await expect(service.start({ sub: USER, email: 'a@b.c' }, SERIES, EP1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('resumes within an open window without re-stamping it', async () => {
    const existing = playbackRow({
      startedAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const { service, upsert } = makeService({ existingPlayback: existing });

    const session = await service.start({ sub: USER, email: 'a@b.c' }, SERIES, EP1);
    expect(session.expiresAt).toBe(existing.expiresAt?.toISOString());
    expect(upsert).not.toHaveBeenCalled();
  });

  it('404s an episode with no video, mirroring movies', async () => {
    const { service } = makeService({ episodes: [episode(EP1, { videoKey: null })] });
    await expect(service.start({ sub: USER, email: 'a@b.c' }, SERIES, EP1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('flips consumedAt at >=95% progress (episode watch-once)', async () => {
    const { service, updateMany } = makeService({ playableCount: 2, consumedCount: 1 });

    const result = (await service.saveProgress(
      USER,
      SERIES,
      { positionSeconds: 950, durationSeconds: 1000 },
      EP1,
    )) as { consumed: boolean; progress: number };

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: USER, episodeId: EP1, consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(result.consumed).toBe(true);
    expect(result.progress).toBe(0.95);
  });

  it('does not consume below the completion threshold', async () => {
    const { service, updateMany, consume } = makeService();

    const result = (await service.saveProgress(
      USER,
      SERIES,
      { positionSeconds: 949, durationSeconds: 1000 },
      EP1,
    )) as { consumed: boolean };

    expect(updateMany).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    expect(result.consumed).toBe(false);
  });

  it('leaves the series entitlement ACTIVE while playable episodes remain', async () => {
    const { service, consume } = makeService({ playableCount: 2, consumedCount: 1 });
    await service.saveProgress(USER, SERIES, { positionSeconds: 1000, durationSeconds: 1000 }, EP1);
    expect(consume).not.toHaveBeenCalled();
  });

  it('CONSUMES the series entitlement once ALL playable episodes are consumed', async () => {
    const { service, consume } = makeService({
      episodes: [episode(EP1), episode(EP2, { number: 2 })],
      playableCount: 2,
      consumedCount: 2, // this heartbeat consumed the last one
    });

    await service.saveProgress(USER, SERIES, { positionSeconds: 990, durationSeconds: 1000 }, EP2);

    expect(consume).toHaveBeenCalledWith(USER, SERIES);
  });

  it('episode status reports consumed and closes access', async () => {
    const { service } = makeService({
      existingPlayback: playbackRow({
        startedAt: new Date('2026-07-18T00:00:00Z'),
        expiresAt: new Date('2026-07-18T01:00:00Z'),
        consumedAt: new Date('2026-07-18T00:50:00Z'),
      }),
    });

    const state = (await service.status({ sub: USER }, SERIES, EP1)) as {
      hasAccess: boolean;
      consumed: boolean;
      started: boolean;
    };
    expect(state.consumed).toBe(true);
    expect(state.hasAccess).toBe(false);
    expect(state.started).toBe(true);
  });

  it('404s unknown episodes and unpublished titles', async () => {
    const draft = makeService({ title: seriesTitle({ status: 'draft' }) });
    await expect(draft.service.start({ sub: USER, email: 'a@b.c' }, SERIES, EP1)).rejects.toThrow(
      new NotFoundException('Title not found'),
    );

    const { service } = makeService();
    await expect(
      service.start({ sub: USER, email: 'a@b.c' }, SERIES, '33333333-3333-3333-3333-333333333339'),
    ).rejects.toThrow(new NotFoundException('Episode not found'));
  });
});
