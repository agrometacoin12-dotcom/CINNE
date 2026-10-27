import { SeriesService } from './series.service';

const USER = '11111111-1111-1111-1111-111111111111';
const SERIES = '22222222-2222-2222-2222-222222222222';

function build(ticketAt: Date | null, rows: Record<string, unknown>[]) {
  const playbackFindMany = jest.fn(async () => rows);
  const prisma = {
    catalogueTitle: { findUnique: jest.fn(async () => ({ type: 'SERIES', status: 'PUBLISHED' })) },
    season: {
      findMany: jest.fn(async () => [
        {
          id: 'season-1',
          number: 1,
          name: null,
          episodes: ['ep-1', 'ep-2', 'ep-3'].map((id, i) => ({
            id,
            number: i + 1,
            name: `E${i + 1}`,
            overview: null,
            runtimeMinutes: 30,
            videoKey: `originals/video/${id}.mp4`,
          })),
        },
      ]),
    },
    entitlement: { findFirst: jest.fn(async () => (ticketAt ? { createdAt: ticketAt } : null)) },
    episodePlayback: { findMany: playbackFindMany },
  };
  return { service: new SeriesService(prisma as never), playbackFindMany };
}

const consumedFlags = (seasons: Awaited<ReturnType<SeriesService['viewerSeasons']>>) =>
  seasons?.[0]?.episodes.map((e) => e.consumed);

describe('SeriesService.viewerSeasons', () => {
  it('marks watched AND window-closed episodes of the latest ticket as consumed', async () => {
    const ticketAt = new Date('2026-07-01T00:00:00Z');
    const { service, playbackFindMany } = build(ticketAt, [
      { episodeId: 'ep-1', consumedAt: new Date(), expiresAt: null },
      { episodeId: 'ep-2', consumedAt: null, expiresAt: new Date(Date.now() - 1_000) },
      { episodeId: 'ep-3', consumedAt: null, expiresAt: new Date(Date.now() + 60_000) },
    ]);

    expect(consumedFlags(await service.viewerSeasons(SERIES, USER))).toEqual([true, true, false]);
    // Rows from an earlier ticket are filtered out at the query.
    expect(playbackFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER, titleId: SERIES, startedAt: { gte: ticketAt } },
      }),
    );
  });

  it('reports nothing consumed for a viewer who never bought a ticket', async () => {
    const { service, playbackFindMany } = build(null, []);
    expect(consumedFlags(await service.viewerSeasons(SERIES, USER))).toEqual([false, false, false]);
    expect(playbackFindMany).not.toHaveBeenCalled();
  });

  it('omits consumed flags for anonymous requests', async () => {
    const { service } = build(null, []);
    expect(consumedFlags(await service.viewerSeasons(SERIES))).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });
});
