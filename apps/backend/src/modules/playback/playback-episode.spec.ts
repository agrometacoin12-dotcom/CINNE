import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlaybackService, type EpisodePlaybackSession } from './playback.service';

const USER = '11111111-1111-1111-1111-111111111111';
const SERIES = '22222222-2222-2222-2222-222222222222';
const EP1 = '33333333-3333-3333-3333-333333333331';
const EP2 = '33333333-3333-3333-3333-333333333332';
/** When the viewer's current series ticket was bought. */
const TICKET_AT = new Date('2026-07-01T00:00:00Z');
const ticket = { id: 'ent-1', createdAt: TICKET_AT, startedAt: null, expiresAt: null };

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

/** A window opened by /start under the current ticket and still running. */
const watching = (overrides: Partial<EpisodePlaybackRow> = {}) =>
  playbackRow({
    startedAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 3_600_000),
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

  let stored: EpisodePlaybackRow | null = overrides?.existingPlayback ?? null;
  const findUnique = jest.fn(async () => stored);
  const upsert = jest.fn(async ({ create }: { create: Partial<EpisodePlaybackRow>; update: unknown }) => {
    stored ??= playbackRow(create);
    return stored;
  });
  const updateMany = jest.fn(async ({data}: {where: unknown; data: Partial<EpisodePlaybackRow>}) => {
    if (stored) stored = {...stored, ...data};
    return {count: 1};
  });
  const update = jest.fn(async ({ data }: { data: Partial<EpisodePlaybackRow> }) =>
    playbackRow({ ...(overrides?.existingPlayback ?? {}), ...data }),
  );
  const playbackCount = jest.fn(async () => overrides?.consumedCount ?? 0);

  const prisma = {
    entitlement: { count: jest.fn(async () => 1) },
    episode: { findFirst, count: episodeCount },
    episodePlayback: { findUnique, upsert, update, updateMany, count: playbackCount },
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
  const findUsable = jest.fn(async () => ((overrides?.usable ?? true) ? ticket : null));
  const entitlements = { consume, findUsable } as never;
  const audit = { record: jest.fn(async () => undefined) } as never;

  const service = new PlaybackService(catalogue, entitlements, media, audit, prisma);
  return {
    service,
    findUnique,
    upsert,
    update,
    updateMany,
    consume,
    findUsable,
    episodeCount,
    playbackCount,
  };
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
      existingPlayback: playbackRow({
        startedAt: new Date('2026-07-17T23:00:00Z'),
        consumedAt: new Date('2026-07-18T00:00:00Z'),
      }),
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
    const { service, updateMany } = makeService({
      playableCount: 2,
      consumedCount: 1,
      existingPlayback: watching(),
    });

    const result = (await service.saveProgress(
      USER,
      SERIES,
      { positionSeconds: 950, durationSeconds: 1000 },
      EP1,
    )) as { consumed: boolean; progress: number };

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: USER, episodeId: EP1, startedAt: expect.any(Date), consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(result.consumed).toBe(true);
    expect(result.progress).toBe(0.95);
  });

  it('does not consume below the completion threshold', async () => {
    const { service, updateMany, consume } = makeService({ existingPlayback: watching() });

    const result = (await service.saveProgress(
      USER,
      SERIES,
      { positionSeconds: 949, durationSeconds: 1000 },
      EP1,
    )) as { consumed: boolean };

    expect(updateMany).toHaveBeenCalledTimes(1); // position update only
    expect(updateMany.mock.calls[0]?.[0]).not.toHaveProperty("data.consumedAt");
    expect(consume).not.toHaveBeenCalled();
    expect(result.consumed).toBe(false);
  });

  it('leaves the series entitlement ACTIVE while playable episodes remain', async () => {
    const { service, consume } = makeService({
      playableCount: 2,
      consumedCount: 1,
      existingPlayback: watching(),
    });
    await service.saveProgress(USER, SERIES, { positionSeconds: 1000, durationSeconds: 1000 }, EP1);
    expect(consume).not.toHaveBeenCalled();
  });

  it('CONSUMES the series entitlement once ALL playable episodes are consumed', async () => {
    const { service, consume } = makeService({
      episodes: [episode(EP1), episode(EP2, { number: 2 })],
      playableCount: 2,
      consumedCount: 2, // this heartbeat consumed the last one
      existingPlayback: watching({ episodeId: EP2 }),
    });

    await service.saveProgress(USER, SERIES, { positionSeconds: 990, durationSeconds: 1000 }, EP2);

    expect(consume).toHaveBeenCalledWith(USER, SERIES, ticket.id);
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

  it('gives a re-bought series a fresh watch of episodes watched on an earlier ticket', async () => {
    const { service, upsert, updateMany } = makeService({
      existingPlayback: playbackRow({
        positionSeconds: 990,
        startedAt: new Date('2026-06-01T00:00:00Z'),
        expiresAt: new Date('2026-06-01T01:00:00Z'),
        consumedAt: new Date('2026-06-01T00:50:00Z'),
      }),
    });

    const session = await service.start({ sub: USER, email: 'a@b.c' }, SERIES, EP1);

    const args = upsert.mock.calls[0]?.[0] as { update: Partial<EpisodePlaybackRow> };
    expect(args.update).toEqual({});
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({data: expect.objectContaining({consumedAt:null, positionSeconds:0, startedAt:expect.any(Date)})}));
    expect(session.resumeSeconds).toBe(0);
  });

  it('rejects a delayed completion from the previous ticket after repurchase', async () => {
    const {service, updateMany, consume} = makeService({existingPlayback: watching()});
    await expect(service.saveProgress(USER, SERIES, {positionSeconds:1000,durationSeconds:1000,sessionId:'old-ticket'}, EP1)).rejects.toThrow('another ticket');
    expect(updateMany).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it('accepts progress bound to the current ticket', async () => {
    const {service} = makeService({existingPlayback: watching()});
    await expect(service.saveProgress(USER, SERIES, {positionSeconds:50,durationSeconds:1000,sessionId:ticket.id}, EP1)).resolves.toMatchObject({positionSeconds:50,consumed:false});
  });

  it('never stamps a start before the ticket was bought (clock skew)', async () => {
    const future = new Date(Date.now() + 60_000);
    const { service, upsert, findUsable } = makeService();
    findUsable.mockResolvedValueOnce({ ...ticket, createdAt: future } as never);

    await service.start({ sub: USER, email: 'a@b.c' }, SERIES, EP1);

    const args = upsert.mock.calls[0]?.[0] as { create: { startedAt: Date } };
    expect(args.create.startedAt.getTime()).toBe(future.getTime());
  });

  it('refuses a heartbeat for an episode that was never started on this ticket', async () => {
    const fresh = makeService();
    await expect(
      fresh.service.saveProgress(
        USER,
        SERIES,
        { positionSeconds: 990, durationSeconds: 1000 },
        EP1,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const stale = makeService({
      existingPlayback: watching({ startedAt: new Date('2026-06-01T00:00:00Z') }),
    });
    await expect(
      stale.service.saveProgress(
        USER,
        SERIES,
        { positionSeconds: 990, durationSeconds: 1000 },
        EP1,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(stale.update).not.toHaveBeenCalled();
    expect(stale.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a heartbeat after the episode window closed', async () => {
    const { service, update } = makeService({
      existingPlayback: watching({ expiresAt: new Date(Date.now() - 1_000) }),
    });
    await expect(
      service.saveProgress(USER, SERIES, { positionSeconds: 500, durationSeconds: 1000 }, EP1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('treats heartbeats after completion as a no-op, even once the ticket is used up', async () => {
    const { service, update, findUsable } = makeService({
      usable: false,
      existingPlayback: watching({ positionSeconds: 1000, consumedAt: new Date() }),
    });

    const result = (await service.saveProgress(
      USER,
      SERIES,
      { positionSeconds: 1000, durationSeconds: 1000 },
      EP1,
    )) as { consumed: boolean };

    expect(result.consumed).toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect(findUsable).not.toHaveBeenCalled();
  });

  it('ends the series ticket when the last open episode window runs out unwatched', async () => {
    const { service, consume } = makeService({
      playableCount: 1,
      consumedCount: 1, // closed: window expired
      existingPlayback: watching({ expiresAt: new Date(Date.now() - 1_000) }),
    });

    await expect(service.start({ sub: USER, email: 'a@b.c' }, SERIES, EP1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(consume).toHaveBeenCalledWith(USER, SERIES, ticket.id);
  });

  it('series status settles a fully used ticket so the viewer can buy again', async () => {
    const { service, consume, playbackCount } = makeService({ playableCount: 2, consumedCount: 2 });

    const state = await service.status({ sub: USER }, SERIES);

    expect(consume).toHaveBeenCalledWith(USER, SERIES, ticket.id);
    expect(state.hasAccess).toBe(false);
    expect(playbackCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ startedAt: { gte: TICKET_AT } }),
    });
  });

  it('series status keeps access while an episode is still unwatched', async () => {
    const { service, consume } = makeService({ playableCount: 2, consumedCount: 1 });
    const state = await service.status({ sub: USER }, SERIES);
    expect(consume).not.toHaveBeenCalled();
    expect(state.hasAccess).toBe(true);
  });

  it('episode status denies an episode with no video yet', async () => {
    const { service } = makeService({ episodes: [episode(EP1, { videoKey: null })] });
    const state = await service.status({ sub: USER }, SERIES, EP1);
    expect(state.hasAccess).toBe(false);
  });
});
