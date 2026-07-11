import { BadRequestException } from '@nestjs/common';
import { PlaybackService } from './playback.service';

const USER = '11111111-1111-1111-1111-111111111111';
const TITLE = '22222222-2222-2222-2222-222222222222';

type ProgressRow = {
  userId: string;
  titleId: string;
  positionSeconds: number;
  durationSeconds: number;
  updatedAt: Date;
};

function makeService(overrides?: {
  rows?: ProgressRow[];
  titles?: Record<
    string,
    { title: string; status: string; posterKey: string | null; heroKey: string | null } | null
  >;
  /** Per-title override for whether the viewer still holds an ACTIVE entitlement. */
  usable?: Record<string, boolean>;
}) {
  type UpsertArgs = {
    where: unknown;
    create: Omit<ProgressRow, 'updatedAt'>;
    update: { positionSeconds: number; durationSeconds: number };
  };
  const upsert = jest.fn(async ({ create }: UpsertArgs): Promise<ProgressRow> => ({
    ...create,
    updatedAt: new Date('2026-07-11T10:00:00Z'),
  }));
  const findMany = jest.fn(async () => overrides?.rows ?? []);
  const deleteMany = jest.fn(async () => ({ count: 1 }));
  const prisma = { playbackProgress: { upsert, findMany, deleteMany } } as never;

  const catalogue = {
    findRaw: jest.fn(async (id: string) => overrides?.titles?.[id] ?? null),
  } as never;
  const media = {
    playbackUrl: jest.fn((key: string) => `https://signed.test/${key}`),
    publicUrl: jest.fn((key: string) => `https://cdn.test/${key}`),
  } as never;

  const consume = jest.fn(async () => {});
  const hasUsable = jest.fn(
    async (_userId: string, titleId: string) => overrides?.usable?.[titleId] ?? true,
  );
  const findUsable = jest.fn(async (_userId: string, titleId: string) =>
    (overrides?.usable?.[titleId] ?? true)
      ? { id: 'ent-1', startedAt: null, expiresAt: null }
      : null,
  );
  const entitlements = { consume, hasUsable, findUsable } as never;

  const service = new PlaybackService(catalogue, entitlements, media, null as never, prisma);
  return { service, upsert, findMany, deleteMany, consume, hasUsable, findUsable };
}

describe('PlaybackService progress', () => {
  it('upserts on unique(userId, titleId) and echoes the saved row', async () => {
    const { service, upsert } = makeService();
    const result = await service.saveProgress(USER, TITLE, {
      positionSeconds: 600,
      durationSeconds: 6000,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { userId_titleId: { userId: USER, titleId: TITLE } },
      create: { userId: USER, titleId: TITLE, positionSeconds: 600, durationSeconds: 6000 },
      update: { positionSeconds: 600, durationSeconds: 6000 },
    });
    expect(result).toEqual({
      titleId: TITLE,
      positionSeconds: 600,
      durationSeconds: 6000,
      progress: 0.1,
      updatedAt: '2026-07-11T10:00:00.000Z',
    });
  });

  it('clamps position into [0, duration]', async () => {
    const { service, upsert } = makeService();

    await service.saveProgress(USER, TITLE, { positionSeconds: 9999, durationSeconds: 6000 });
    expect(upsert.mock.calls[0]?.[0].update.positionSeconds).toBe(6000);

    await service.saveProgress(USER, TITLE, { positionSeconds: -50, durationSeconds: 6000 });
    expect(upsert.mock.calls[1]?.[0].update.positionSeconds).toBe(0);
  });

  it('rejects non-positive durations with 400', async () => {
    const { service, upsert } = makeService();
    await expect(
      service.saveProgress(USER, TITLE, { positionSeconds: 10, durationSeconds: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.saveProgress(USER, TITLE, { positionSeconds: 10, durationSeconds: -1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('consumes the entitlement once the viewer reaches completion (>=95%)', async () => {
    const { service, consume } = makeService();

    await service.saveProgress(USER, TITLE, { positionSeconds: 950, durationSeconds: 1000 }); // 95%
    expect(consume).toHaveBeenCalledWith(USER, TITLE);

    await service.saveProgress(USER, TITLE, { positionSeconds: 1000, durationSeconds: 1000 }); // 100%
    expect(consume).toHaveBeenCalledTimes(2); // idempotent replay is harmless
  });

  it('does not consume the entitlement below the completion threshold', async () => {
    const { service, consume } = makeService();
    await service.saveProgress(USER, TITLE, { positionSeconds: 949, durationSeconds: 1000 }); // 94.9%
    expect(consume).not.toHaveBeenCalled();
  });

  it('lists continue-watching newest first, excluding finished/missing/unpublished', async () => {
    const t = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
    const row = (titleId: string, position: number, updatedAt: string): ProgressRow => ({
      userId: USER,
      titleId,
      positionSeconds: position,
      durationSeconds: 1000,
      updatedAt: new Date(updatedAt),
    });

    const { service, findMany } = makeService({
      rows: [
        row(t(1), 500, '2026-07-11T09:00:00Z'), // in progress → kept
        row(t(2), 960, '2026-07-11T08:00:00Z'), // 96% → excluded (finished)
        row(t(3), 100, '2026-07-11T07:00:00Z'), // title missing → excluded
        row(t(4), 100, '2026-07-11T06:00:00Z'), // draft → excluded
        row(t(5), 950, '2026-07-11T05:00:00Z'), // exactly 95% → kept (only >95% excluded)
      ],
      titles: {
        [t(1)]: { title: 'Alpha', status: 'published', posterKey: 'p1.jpg', heroKey: 'h1.jpg' },
        [t(2)]: { title: 'Beta', status: 'published', posterKey: null, heroKey: null },
        [t(3)]: null,
        [t(4)]: { title: 'Draft', status: 'draft', posterKey: null, heroKey: null },
        [t(5)]: { title: 'Edge', status: 'published', posterKey: null, heroKey: null },
      },
    });

    const list = await service.continueWatching(USER);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER }, orderBy: { updatedAt: 'desc' } }),
    );
    expect(list.map((i) => i.titleId)).toEqual([t(1), t(5)]);
    expect(list[0]).toEqual({
      titleId: t(1),
      title: 'Alpha',
      posterUrl: 'https://cdn.test/p1.jpg',
      heroUrl: 'https://cdn.test/h1.jpg',
      positionSeconds: 500,
      durationSeconds: 1000,
      progress: 0.5,
      updatedAt: '2026-07-11T09:00:00.000Z',
    });
  });

  it('drops titles the viewer no longer holds an ACTIVE entitlement for (consumed)', async () => {
    const t = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
    const row = (titleId: string, updatedAt: string): ProgressRow => ({
      userId: USER,
      titleId,
      positionSeconds: 400, // 40% — well below the finished threshold
      durationSeconds: 1000,
      updatedAt: new Date(updatedAt),
    });

    const { service } = makeService({
      rows: [row(t(1), '2026-07-11T09:00:00Z'), row(t(2), '2026-07-11T08:00:00Z')],
      titles: {
        [t(1)]: { title: 'Kept', status: 'published', posterKey: null, heroKey: null },
        [t(2)]: { title: 'Consumed', status: 'published', posterKey: null, heroKey: null },
      },
      usable: { [t(1)]: true, [t(2)]: false }, // t(2) was watched to completion → CONSUMED
    });

    const list = await service.continueWatching(USER);
    expect(list.map((i) => i.titleId)).toEqual([t(1)]);
  });

  it('reports hasAccess=false in status once the entitlement is consumed', async () => {
    const { service } = makeService({
      titles: {
        [TITLE]: {
          title: 'Gone',
          status: 'published',
          posterKey: null,
          heroKey: null,
        } as never,
      },
      usable: { [TITLE]: false }, // consumed → findUsable returns null
    });

    const state = await service.status({ sub: USER }, TITLE);
    expect(state.hasAccess).toBe(false);
    expect(state.started).toBe(false);
    expect(state.expiresAt).toBeNull();
  });

  it('clears progress idempotently', async () => {
    const { service, deleteMany } = makeService();
    await expect(service.clearProgress(USER, TITLE)).resolves.toEqual({
      titleId: TITLE,
      cleared: true,
    });
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: USER, titleId: TITLE } });
  });
});
