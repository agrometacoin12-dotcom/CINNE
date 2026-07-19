import type { ApiClient } from './api-client';
import type {
  AdminAuditEntry,
  AdminAuditResponse,
  AdminEpisode,
  AdminPurchase,
  AdminPurchasesResponse,
  AdminSeason,
  AdminSeriesDetail,
  AdminSeriesListResponse,
  AdminStats,
  AdminTitle,
  AdminUser,
  AdminUsersResponse,
  EpisodeUpsert,
  Me,
  PresignKind,
  PresignResponse,
  SeasonUpsert,
  TitleUpsert,
  TokenPair,
  UploadStatResponse,
} from './types';

/**
 * Dev/verification-only in-memory implementation of ApiClient, used when the
 * app is launched with --mock. Fixture data is realistic enough to exercise
 * every screen; mutations update local state so flows feel real.
 */

let seq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const delay = (ms = 220) => new Promise<void>((r) => setTimeout(r, ms));

const POSTER = (seed: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" rx="8" fill="#141824"/><rect x="8" y="8" width="64" height="80" rx="6" fill="#6366f1" opacity="0.35"/><text x="40" y="108" font-family="sans-serif" font-size="11" fill="#9ca3af" text-anchor="middle">${seed}</text></svg>`,
  )}`;

function movie(partial: Partial<AdminTitle> & { title: string; year: number }): AdminTitle {
  return {
    id: uid(),
    type: 'movie',
    rating: 4.2,
    genres: ['Drama'],
    posterUrl: POSTER(partial.title.slice(0, 8)),
    tagline: null,
    overview: 'A CinneTemple original.',
    runtimeMinutes: 110,
    seasons: null,
    maturityRating: 'PG-13',
    heroUrl: null,
    cast: [],
    director: null,
    categories: ['new-listings'],
    priceMinor: 250_000,
    currency: 'NGN',
    durationSeconds: 6600,
    isPremiere: false,
    premiereStartAt: null,
    premiereLive: false,
    hasVideo: true,
    status: 'published',
    featured: false,
    videoKey: 'videos/mock.mp4',
    posterKey: 'posters/mock.jpg',
    heroKey: null,
    popularity: 62,
    ...partial,
  };
}

const movies: AdminTitle[] = [
  movie({
    title: 'Lagos After Dark',
    year: 2026,
    genres: ['Thriller', 'Crime'],
    tagline: 'The city never forgives.',
    overview:
      'A dispatch rider uncovers a laundering ring that runs through the heart of Lagos nightlife.',
    priceMinor: 350_000,
    featured: true,
    popularity: 97,
    cast: ['Adaeze Okafor', 'Tobi Bakre'],
    director: 'Kemi Adetiba',
  }),
  movie({
    title: 'The Bride Price',
    year: 2025,
    genres: ['Romance', 'Drama'],
    overview: 'Two families. One wedding. A secret that could burn it all down.',
    priceMinor: 250_000,
    popularity: 84,
  }),
  movie({
    title: 'Third Mainland',
    year: 2026,
    genres: ['Action'],
    overview: 'A heist crew plans one last job on the longest bridge in West Africa.',
    priceMinor: 400_000,
    isPremiere: true,
    premiereStartAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    popularity: 91,
  }),
  movie({
    title: 'Ebony Crown',
    year: 2024,
    genres: ['Historical', 'Epic'],
    overview: 'The rise of a queen in the old Benin Kingdom.',
    status: 'draft',
    hasVideo: false,
    videoKey: null,
    priceMinor: 300_000,
    popularity: 40,
  }),
  movie({
    title: 'Suya Nights',
    year: 2025,
    genres: ['Comedy'],
    overview: 'A street-food vendor accidentally becomes the most wanted man in Abuja.',
    priceMinor: 200_000,
    popularity: 73,
  }),
];

interface MockSeries {
  title: AdminTitle;
  seasons: AdminSeason[];
}

function makeEpisode(number: number, name: string, hasVideo: boolean): AdminEpisode {
  return {
    id: uid(),
    number,
    name,
    overview: hasVideo ? 'An episode of a CinneTemple original series.' : null,
    runtimeMinutes: 42,
    durationSeconds: hasVideo ? 2520 : null,
    videoKey: hasVideo ? `videos/ep-${number}.mp4` : null,
    stillKey: null,
    hasVideo,
  };
}

const seriesStore: MockSeries[] = [
  {
    title: movie({
      title: 'Gidi Republic',
      year: 2026,
      type: 'series',
      genres: ['Political', 'Drama'],
      tagline: 'Power is never given.',
      overview:
        'An idealistic aide climbs the ranks of Lagos state politics and loses pieces of herself on every floor.',
      runtimeMinutes: null,
      seasons: 2,
      priceMinor: 500_000,
      popularity: 95,
      videoKey: null,
    }),
    seasons: [
      {
        id: uid(),
        number: 1,
        name: 'The Campaign',
        overview: null,
        episodes: [
          makeEpisode(1, 'First Ballot', true),
          makeEpisode(2, 'Godfathers', true),
          makeEpisode(3, 'Carry Go', true),
          makeEpisode(4, 'No Retreat', true),
        ],
      },
      {
        id: uid(),
        number: 2,
        name: 'The Office',
        overview: null,
        episodes: [makeEpisode(1, 'Oath', true), makeEpisode(2, 'Budget Padding', false)],
      },
    ],
  },
  {
    title: movie({
      title: 'Ojuelegba Blues',
      year: 2025,
      type: 'series',
      genres: ['Music', 'Drama'],
      overview: 'Five friends chase an afrobeats dream from a Surulere garage.',
      runtimeMinutes: null,
      seasons: 1,
      priceMinor: 450_000,
      status: 'draft',
      hasVideo: false,
      videoKey: null,
      popularity: 55,
    }),
    seasons: [
      {
        id: uid(),
        number: 1,
        name: null,
        overview: null,
        episodes: [makeEpisode(1, 'Soundcheck', false)],
      },
    ],
  },
];

const users: AdminUser[] = [
  {
    id: uid(),
    email: 'ogban@icloud.com',
    displayName: 'Ogban',
    roles: ['user', 'admin'],
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: daysAgo(400),
    purchases: 12,
  },
  {
    id: uid(),
    email: 'ada.eze@example.com',
    displayName: 'Ada Eze',
    roles: ['user'],
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: daysAgo(90),
    purchases: 5,
  },
  {
    id: uid(),
    email: 'tunde.b@example.com',
    displayName: 'Tunde Balogun',
    roles: ['user'],
    status: 'ACTIVE',
    emailVerified: false,
    createdAt: daysAgo(31),
    purchases: 1,
  },
  {
    id: uid(),
    email: 'chi.n@example.com',
    displayName: 'Chinwe N.',
    roles: ['user', 'moderator'],
    status: 'ACTIVE',
    emailVerified: true,
    createdAt: daysAgo(200),
    purchases: 9,
  },
  {
    id: uid(),
    email: 'spam.account@example.com',
    displayName: null,
    roles: ['user'],
    status: 'SUSPENDED',
    emailVerified: false,
    createdAt: daysAgo(12),
    purchases: 0,
  },
];

const firstMovie = movies[0]!;
const purchases: AdminPurchase[] = Array.from({ length: 14 }, (_, i) => {
  const buyer = users[i % users.length]!;
  const t = movies[i % movies.length]!;
  const paid = i % 5 !== 4;
  return {
    id: uid(),
    userId: buyer.id,
    userEmail: buyer.email,
    userDisplayName: buyer.displayName,
    titleId: t.id,
    titleName: t.title,
    amountMinor: t.priceMinor,
    currency: 'NGN',
    provider: i % 3 === 2 ? 'apple' : 'paystack',
    status: paid ? 'PAID' : 'PENDING',
    isGift: i % 6 === 3,
    entitlementStatus: paid ? (i % 4 === 1 ? 'CONSUMED' : 'ACTIVE') : null,
    createdAt: daysAgo(i * 2 + 1),
    paidAt: paid ? daysAgo(i * 2 + 1) : null,
  };
});

const audit: AdminAuditEntry[] = [
  {
    action: 'DESKTOP_LINK',
    entity: 'session',
    metadata: { client: 'CinneTemple Studio' },
  },
  { action: 'MOVIE_PUBLISHED', entity: 'title', metadata: { title: 'Lagos After Dark' } },
  { action: 'MOVIE_UPDATED', entity: 'title', metadata: { fields: ['priceMinor'] } },
  { action: 'USER_SUSPENDED', entity: 'user', metadata: { reason: 'chargeback' } },
  { action: 'SERIES_CREATED', entity: 'title', metadata: { title: 'Gidi Republic' } },
  { action: 'EPISODE_VIDEO_ATTACHED', entity: 'episode', metadata: { season: 1, episode: 4 } },
  { action: 'PREMIERE_SCHEDULED', entity: 'title', metadata: { title: 'Third Mainland' } },
  { action: 'USER_ROLES_CHANGED', entity: 'user', metadata: { roles: ['user', 'moderator'] } },
].map((e, i) => ({
  id: uid(),
  actorId: users[0]!.id,
  actorEmail: 'ogban@icloud.com',
  action: e.action,
  entity: e.entity,
  entityId: firstMovie.id,
  metadata: e.metadata as Record<string, unknown>,
  ip: '105.112.34.21',
  createdAt: daysAgo(i),
}));

function toDetail(s: MockSeries): AdminSeriesDetail {
  return {
    ...s.title,
    seasonsList: s.seasons.map((se) => ({ ...se, episodes: [...se.episodes] })),
  };
}

export class MockApiClient implements ApiClient {
  async hasSession(): Promise<boolean> {
    return true;
  }

  async exchangeDesktopCode(): Promise<TokenPair> {
    await delay();
    return { accessToken: 'mock', refreshToken: 'mock', tokenType: 'Bearer', expiresIn: 900 };
  }

  async me(): Promise<Me> {
    await delay(80);
    return {
      id: users[0]!.id,
      email: 'ogban@icloud.com',
      emailVerified: true,
      mfaEnabled: false,
      status: 'ACTIVE',
      roles: ['user', 'admin'],
      isAdmin: true,
      profile: { displayName: 'Ogban', avatarUrl: null, locale: 'en-NG' },
    };
  }

  async logout(): Promise<void> {
    await delay(60);
  }

  async stats(): Promise<AdminStats> {
    await delay();
    const paid = purchases.filter((p) => p.status === 'PAID');
    return {
      users: users.length + 2381,
      titles: movies.length + seriesStore.length,
      published:
        movies.filter((m) => m.status === 'published').length +
        seriesStore.filter((s) => s.title.status === 'published').length,
      purchases: paid.length + 8_412,
      activeEntitlements: 1_203,
      revenue: [
        { currency: 'NGN', totalMinor: paid.reduce((a, p) => a + p.amountMinor, 0) + 2_745_000_00 },
      ],
    };
  }

  // ── movies ────────────────────────────────────────────────────────────────
  async listMovies(): Promise<AdminTitle[]> {
    await delay();
    return movies.map((m) => ({ ...m }));
  }

  async getMovie(id: string): Promise<AdminTitle> {
    await delay(100);
    const m = movies.find((x) => x.id === id);
    if (!m) throw new Error('Not found');
    return { ...m };
  }

  async createMovie(body: TitleUpsert): Promise<AdminTitle> {
    await delay();
    const created = movie({
      title: body.title ?? 'Untitled',
      year: body.year ?? new Date().getFullYear(),
      ...body,
      status: 'draft',
      hasVideo: false,
      videoKey: null,
      posterUrl: null,
      posterKey: body.posterKey ?? null,
    } as Partial<AdminTitle> & { title: string; year: number });
    movies.unshift(created);
    return { ...created };
  }

  async updateMovie(id: string, body: TitleUpsert): Promise<AdminTitle> {
    await delay();
    const m = movies.find((x) => x.id === id);
    if (!m) throw new Error('Not found');
    Object.assign(m, body, { hasVideo: (body.videoKey ?? m.videoKey) != null });
    return { ...m };
  }

  async deleteMovie(id: string): Promise<{ deleted: boolean; id: string; soldTickets: number }> {
    await delay();
    const i = movies.findIndex((x) => x.id === id);
    if (i >= 0) movies.splice(i, 1);
    return { deleted: true, id, soldTickets: 0 };
  }

  async setFeatured(id: string, featured: boolean): Promise<AdminTitle> {
    return this.updateMovie(id, { featured });
  }

  async setPremiere(
    id: string,
    isPremiere: boolean,
    premiereStartAt?: string,
  ): Promise<AdminTitle> {
    await delay();
    const m = movies.find((x) => x.id === id);
    if (!m) throw new Error('Not found');
    m.isPremiere = isPremiere;
    m.premiereStartAt = isPremiere ? (premiereStartAt ?? null) : null;
    return { ...m };
  }

  // ── series ────────────────────────────────────────────────────────────────
  async listSeries(opts?: {
    query?: string;
    take?: number;
    skip?: number;
  }): Promise<AdminSeriesListResponse> {
    await delay();
    let list = seriesStore;
    if (opts?.query) {
      const q = opts.query.toLowerCase();
      list = list.filter((s) => s.title.title.toLowerCase().includes(q));
    }
    const skip = opts?.skip ?? 0;
    const take = opts?.take ?? 50;
    return {
      total: list.length,
      items: list.slice(skip, skip + take).map((s) => ({
        id: s.title.id,
        title: s.title.title,
        year: s.title.year,
        status: s.title.status,
        priceMinor: s.title.priceMinor,
        currency: s.title.currency,
        posterUrl: s.title.posterUrl,
        genres: s.title.genres,
        featured: s.title.featured,
        seasonCount: s.seasons.length,
        episodeCount: s.seasons.reduce((a, se) => a + se.episodes.length, 0),
      })),
    };
  }

  async createSeries(body: TitleUpsert): Promise<AdminTitle> {
    await delay();
    const t = movie({
      title: body.title ?? 'Untitled series',
      year: body.year ?? new Date().getFullYear(),
      ...body,
      type: 'series',
      status: 'draft',
      hasVideo: false,
      videoKey: null,
      runtimeMinutes: null,
      seasons: 0,
      posterUrl: null,
    } as Partial<AdminTitle> & { title: string; year: number });
    seriesStore.unshift({ title: t, seasons: [] });
    return { ...t };
  }

  private findSeries(id: string): MockSeries {
    const s = seriesStore.find((x) => x.title.id === id);
    if (!s) throw new Error('Series not found');
    return s;
  }

  async getSeries(id: string): Promise<AdminSeriesDetail> {
    await delay(120);
    return toDetail(this.findSeries(id));
  }

  async updateSeries(id: string, body: TitleUpsert): Promise<AdminSeriesDetail> {
    await delay();
    const s = this.findSeries(id);
    if (body.status === 'published') {
      const anyVideo = s.seasons.some((se) => se.episodes.some((e) => e.hasVideo));
      if (!anyVideo) {
        const err = new Error('A series needs at least one episode with video before publishing.');
        (err as Error & { status?: number }).status = 422;
        throw err;
      }
    }
    Object.assign(s.title, body);
    return toDetail(s);
  }

  async deleteSeries(id: string): Promise<{ deleted: boolean; id: string }> {
    await delay();
    const i = seriesStore.findIndex((x) => x.title.id === id);
    if (i >= 0) seriesStore.splice(i, 1);
    return { deleted: true, id };
  }

  async createSeason(
    seriesId: string,
    body: SeasonUpsert & { number: number },
  ): Promise<AdminSeason> {
    await delay();
    const s = this.findSeries(seriesId);
    const season: AdminSeason = {
      id: uid(),
      number: body.number,
      name: body.name ?? null,
      overview: body.overview ?? null,
      episodes: [],
    };
    s.seasons.push(season);
    s.seasons.sort((a, b) => a.number - b.number);
    s.title.seasons = s.seasons.length;
    return { ...season };
  }

  private findSeason(seasonId: string): { series: MockSeries; season: AdminSeason } {
    for (const series of seriesStore) {
      const season = series.seasons.find((se) => se.id === seasonId);
      if (season) return { series, season };
    }
    throw new Error('Season not found');
  }

  async updateSeason(seasonId: string, body: SeasonUpsert): Promise<AdminSeason> {
    await delay();
    const { season } = this.findSeason(seasonId);
    Object.assign(season, body);
    return { ...season, episodes: [...season.episodes] };
  }

  async deleteSeason(seasonId: string): Promise<{ deleted: boolean }> {
    await delay();
    const { series, season } = this.findSeason(seasonId);
    series.seasons = series.seasons.filter((se) => se.id !== season.id);
    series.title.seasons = series.seasons.length;
    return { deleted: true };
  }

  async createEpisode(
    seasonId: string,
    body: EpisodeUpsert & { number: number; name: string },
  ): Promise<AdminEpisode> {
    await delay();
    const { season } = this.findSeason(seasonId);
    const ep: AdminEpisode = {
      id: uid(),
      number: body.number,
      name: body.name,
      overview: body.overview ?? null,
      runtimeMinutes: body.runtimeMinutes ?? null,
      durationSeconds: body.durationSeconds ?? null,
      videoKey: body.videoKey ?? null,
      stillKey: body.stillKey ?? null,
      hasVideo: (body.videoKey ?? null) != null,
    };
    season.episodes.push(ep);
    season.episodes.sort((a, b) => a.number - b.number);
    return { ...ep };
  }

  private findEpisode(episodeId: string): AdminEpisode {
    for (const series of seriesStore) {
      for (const season of series.seasons) {
        const ep = season.episodes.find((e) => e.id === episodeId);
        if (ep) return ep;
      }
    }
    throw new Error('Episode not found');
  }

  async updateEpisode(episodeId: string, body: EpisodeUpsert): Promise<AdminEpisode> {
    await delay();
    const ep = this.findEpisode(episodeId);
    Object.assign(ep, body);
    ep.hasVideo = ep.videoKey != null;
    return { ...ep };
  }

  async deleteEpisode(episodeId: string): Promise<{ deleted: boolean }> {
    await delay();
    for (const series of seriesStore) {
      for (const season of series.seasons) {
        const i = season.episodes.findIndex((e) => e.id === episodeId);
        if (i >= 0) {
          season.episodes.splice(i, 1);
          return { deleted: true };
        }
      }
    }
    return { deleted: false };
  }

  // ── uploads ───────────────────────────────────────────────────────────────
  async presignUpload(kind: PresignKind, contentType: string): Promise<PresignResponse> {
    await delay(120);
    const ext = contentType.split('/')[1] ?? 'bin';
    return {
      enabled: false, // signals "no real bucket" — the upload manager simulates progress
      key: `${kind}s/mock-${Date.now()}.${ext}`,
      uploadUrl: null,
      headers: {},
    };
  }

  async uploadStat(): Promise<UploadStatResponse> {
    await delay(80);
    return { exists: true, size: 734_003_200 };
  }

  // ── users ─────────────────────────────────────────────────────────────────
  async listUsers(q?: string, take = 50, skip = 0): Promise<AdminUsersResponse> {
    await delay();
    let list = users;
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter(
        (u) =>
          u.email.toLowerCase().includes(needle) ||
          (u.displayName ?? '').toLowerCase().includes(needle),
      );
    }
    return { total: list.length, users: list.slice(skip, skip + take).map((u) => ({ ...u })) };
  }

  private user(id: string): AdminUser {
    const u = users.find((x) => x.id === id);
    if (!u) throw new Error('User not found');
    return u;
  }

  async setUserRoles(id: string, roles: string[]): Promise<AdminUser> {
    await delay();
    const u = this.user(id);
    u.roles = roles;
    return { ...u };
  }

  async setUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<AdminUser> {
    await delay();
    const u = this.user(id);
    u.status = status;
    return { ...u };
  }

  async verifyUser(id: string): Promise<AdminUser> {
    await delay();
    const u = this.user(id);
    u.emailVerified = true;
    return { ...u };
  }

  // ── purchases + audit ─────────────────────────────────────────────────────
  async listPurchases(opts?: {
    q?: string;
    titleId?: string;
    status?: string;
    take?: number;
    skip?: number;
  }): Promise<AdminPurchasesResponse> {
    await delay();
    let list = purchases;
    if (opts?.q) {
      const needle = opts.q.toLowerCase();
      list = list.filter(
        (p) =>
          p.userEmail.toLowerCase().includes(needle) || p.titleName.toLowerCase().includes(needle),
      );
    }
    if (opts?.titleId) list = list.filter((p) => p.titleId === opts.titleId);
    if (opts?.status) list = list.filter((p) => p.status === opts.status);
    const skip = opts?.skip ?? 0;
    const take = opts?.take ?? 50;
    return { total: list.length, items: list.slice(skip, skip + take).map((p) => ({ ...p })) };
  }

  async listAudit(take = 50, skip = 0): Promise<AdminAuditResponse> {
    await delay();
    return { total: audit.length, items: audit.slice(skip, skip + take).map((a) => ({ ...a })) };
  }
}
