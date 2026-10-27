import { ForbiddenException } from '@nestjs/common';
import { PlaybackService } from './playback.service';

function fixture() {
  const now = Date.now();
  const title = {
    id: 'film',
    title: 'Film',
    status: 'published',
    videoKey: 'originals/video/film.mp4',
    durationSeconds: 1000,
    isPremiere: false,
  };
  const ent = {
    id: 'ticket',
    createdAt: new Date(now - 120_000),
    startedAt: new Date(now - 60_000),
    expiresAt: new Date(now + 3600_000),
  };
  const findRaw = jest.fn().mockResolvedValue(title);
  const startViewing = jest.fn().mockResolvedValue(ent);
  const findUsable = jest.fn().mockResolvedValue(ent);
  const progress = {
    positionSeconds: 120,
    durationSeconds: 1000,
    updatedAt: new Date(now - 10_000),
  };
  const findUnique = jest.fn().mockResolvedValue(progress);
  const playbackUrl = jest.fn().mockResolvedValue('https://api.test/master.m3u8');
  const episodeLookup = jest.fn().mockResolvedValue(null);
  const service = new PlaybackService(
    { findRaw } as never,
    { startViewing, findUsable } as never,
    { playbackUrl: () => 'https://api.test/original.mp4' } as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    {
      playbackProgress: { findUnique },
      episode: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ep',
          titleId: 'film',
          videoKey: 'originals/video/episode.mp4',
        }),
      },
      episodePlayback: { findUnique: episodeLookup },
    } as never,
    { playbackUrl } as never,
  );
  return {
    service,
    episodeLookup,
    ent,
    findRaw,
    startViewing,
    findUsable,
    findUnique,
    playbackUrl,
    progress,
  };
}

describe('Playback startup', () => {
  it('returns the current movie resume point in the authorized response', async () => {
    const f = fixture();
    const session = await f.service.start(
      { sub: 'viewer', email: 'viewer@test' },
      'film',
      undefined,
      'hls',
    );
    expect(session.resumeSeconds).toBe(120);
    expect(session.url).toContain('master.m3u8');
    expect(f.findUnique).toHaveBeenCalledWith({
      where: { userId_titleId: { userId: 'viewer', titleId: 'film' } },
    });
  });
  it('does not resume progress from an earlier ticket', async () => {
    const f = fixture();
    f.ent.startedAt = new Date();
    expect((await f.service.start({ sub: 'viewer', email: 'v@test' }, 'film')).resumeSeconds).toBe(
      0,
    );
  });
  it('keeps original-file delivery for old clients and unencoded media', async () => {
    const f = fixture();
    expect((await f.service.start({ sub: 'viewer', email: 'v@test' }, 'film')).url).toContain(
      'original.mp4',
    );
    expect(f.playbackUrl).not.toHaveBeenCalled();
    f.playbackUrl.mockResolvedValue(null);
    expect(
      (await f.service.start({ sub: 'viewer', email: 'v@test' }, 'film', undefined, 'hls')).url,
    ).toContain('original.mp4');
  });
  it('preparation checks access but never opens a ticket or reads full history', async () => {
    const f = fixture();
    await f.service.prepare({ sub: 'viewer' }, 'film');
    expect(f.startViewing).not.toHaveBeenCalled();
    expect(f.findUnique).not.toHaveBeenCalled();
    expect(f.playbackUrl).toHaveBeenCalledWith(
      'originals/video/film.mp4',
      'viewer',
      f.ent.expiresAt.toISOString(),
      'prepare',
    );
  });
  it('caps episode preparation at the earlier episode window', async () => {
    const f = fixture();
    const expiry = new Date(Date.now() + 60_000);
    f.episodeLookup.mockResolvedValue({
      startedAt: new Date(Date.now() - 1_000),
      expiresAt: expiry,
      consumedAt: null,
    });
    await f.service.prepare({ sub: 'viewer' }, 'film', 'ep');
    expect(f.playbackUrl).toHaveBeenCalledWith(
      'originals/video/episode.mp4',
      'viewer',
      expiry.toISOString(),
      'prepare',
    );
    expect(f.startViewing).not.toHaveBeenCalled();
  });
  it('rejects preparation for a consumed or expired episode', async () => {
    const f = fixture();
    const startedAt = new Date(Date.now() - 1_000);
    for (const playback of [
      { startedAt, consumedAt: new Date(), expiresAt: null },
      { startedAt, consumedAt: null, expiresAt: new Date(Date.now() - 1) },
    ]) {
      f.episodeLookup.mockResolvedValue(playback);
      await expect(f.service.prepare({ sub: 'viewer' }, 'film', 'ep')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    }
    expect(f.playbackUrl).not.toHaveBeenCalled();
  });

  it('ignores an episode watched under an earlier ticket', async () => {
    const f = fixture();
    f.episodeLookup.mockResolvedValue({
      startedAt: new Date(f.ent.createdAt.getTime() - 86_400_000),
      consumedAt: new Date(f.ent.createdAt.getTime() - 80_000_000),
      expiresAt: new Date(f.ent.createdAt.getTime() - 80_000_000),
    });
    await f.service.prepare({ sub: 'viewer' }, 'film', 'ep');
    expect(f.playbackUrl).toHaveBeenCalled();
  });

  it('denies preparation without access or before a premiere', async () => {
    const f = fixture();
    f.findUsable.mockResolvedValue(null);
    await expect(f.service.prepare({ sub: 'viewer' }, 'film')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(f.playbackUrl).not.toHaveBeenCalled();
    f.findRaw.mockResolvedValue({
      status: 'published',
      isPremiere: true,
      premiereStartAt: new Date(Date.now() + 3600_000),
    });
    await expect(f.service.prepare({ sub: 'viewer' }, 'film')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
