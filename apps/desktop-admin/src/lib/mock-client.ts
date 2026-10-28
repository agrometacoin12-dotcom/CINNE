import { ApiError, type ApiClient, type ProducerInfo, type ProducerInput } from './api-client';
import {
  HOME_SORTS,
  SLUG_RE,
  deriveIndustries,
  genreParentMap,
  legacyGenreNames,
  normalizeCountryCode,
  normalizeLanguageCode,
  effectiveAccess,
  effectiveFormat,
  parseSectionRules,
} from './classification';
import {
  ACCESS_TYPES,
  AUDIENCES,
  COLLECTIONS,
  DECADES,
  FORMATS,
  GENRES,
  HOME_MAX_ROWS,
  INDUSTRIES,
  LANGUAGES,
  SECTION_SEED,
  TAGS,
  baseEligibility,
  buildSection,
  matchesRules,
  sectionIsUpcoming,
  type MockCandidate,
} from './mock-taxonomy';
import type {
  AccessType,
  Audience,
  ClassificationDto,
  ClassificationInput,
  CollectionCreate,
  CollectionUpdate,
  ContentFormat,
  HomePreview,
  HomeSectionDto,
  HomeSectionPatch,
  SectionRules,
  Taxonomy,
  TaxonomyCollection,
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
    trailerKey: null,
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
  movie({
    title: "Ama's Kitchen",
    year: 2025,
    genres: ['Comedy', 'Family'],
    overview: 'A Kumasi chop bar becomes the unlikely stage for a family reunion.',
    priceMinor: 0,
    runtimeMinutes: 84,
    durationSeconds: 5040,
    maturityRating: 'PG',
    rating: 4.0,
    popularity: 66,
  }),
  movie({
    title: 'King of Oyo',
    year: 2008,
    genres: ['History', 'Drama'],
    overview: 'A crown prince is betrayed by the council sworn to protect him.',
    runtimeMinutes: 156,
    durationSeconds: 9360,
    rating: 4.8,
    popularity: 81,
  }),
  movie({
    title: 'Kano Nights',
    year: 2026,
    genres: ['Romance'],
    overview: 'Two students fall in love across a city divided by tradition.',
    runtimeMinutes: 88,
    durationSeconds: 5280,
    rating: 3.9,
    popularity: 58,
  }),
  movie({
    title: 'Bombay to Lagos',
    year: 2025,
    genres: ['Comedy', 'Romance'],
    overview: 'A Mumbai wedding planner is hired for the loudest Lagos wedding of the year.',
    priceMinor: 300_000,
    rating: 4.3,
    popularity: 77,
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

// ── Classification fixtures ─────────────────────────────────────────────────

interface StoredClassification {
  contentFormat: ContentFormat | null;
  genres: string[];
  tags: string[];
  collections: string[];
  manualIndustries: string[];
  audience: Audience | null;
  ageRating: string | null;
  ratingJurisdiction: string | null;
  releaseDate: string | null;
  accessType: AccessType | null;
  productionCountries: string[];
  originalLanguages: string[];
  audioLanguages: string[];
  availableFrom: string | null;
  availableUntil: string | null;
  seriesComplete: boolean;
  publishedAt: string | null;
}

const blankClassification = (): StoredClassification => ({
  contentFormat: null,
  genres: [],
  tags: [],
  collections: [],
  manualIndustries: [],
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
  publishedAt: null,
});

const dateIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const CLASSIFICATION_SEED: Record<string, Partial<StoredClassification>> = {
  'Lagos After Dark': {
    genres: ['thriller-conspiracy', 'crime-organized-crime'],
    tags: ['gritty', 'suspenseful', 'corruption', 'city-life'],
    collections: ['editors-picks', 'trending'],
    audience: 'ADULTS', ageRating: '18', ratingJurisdiction: 'NG',
    releaseDate: dateIn(-60), productionCountries: ['NG'], originalLanguages: ['en', 'pcm'],
    audioLanguages: ['en'], publishedAt: daysAgo(40),
  },
  'The Bride Price': {
    genres: ['romance-romantic-drama', 'drama-family-drama'],
    tags: ['wedding', 'marriage', 'family-conflict', 'emotional', 'strong-female-lead'],
    collections: ['editors-picks'],
    audience: 'ADULTS', ageRating: '15', ratingJurisdiction: 'NG',
    releaseDate: '2025-11-02', productionCountries: ['NG'], originalLanguages: ['en', 'ig'],
    audioLanguages: ['en'], publishedAt: daysAgo(120),
  },
  'Third Mainland': {
    genres: ['action', 'crime-heist'],
    tags: ['intense', 'ambition'],
    collections: ['exclusive-premieres'],
    audience: 'ADULTS', releaseDate: dateIn(3), productionCountries: ['NG'],
    originalLanguages: ['en', 'yo'], audioLanguages: ['en'], publishedAt: daysAgo(2),
  },
  'Ebony Crown': {
    genres: ['history-period-film', 'drama'],
    tags: ['royalty', 'power', 'tradition', 'strong-female-lead'],
    collections: ['cinnetemple-originals'],
    productionCountries: ['NG'], originalLanguages: ['yo'], audioLanguages: ['yo', 'en'],
  },
  'Suya Nights': {
    genres: ['comedy-slapstick'],
    tags: ['funny', 'feel-good', 'city-life'],
    collections: ['weekend-picks'],
    audience: 'TEENS', releaseDate: '2025-12-19', productionCountries: ['NG'],
    originalLanguages: ['en', 'pcm', 'ha'], audioLanguages: ['en'], publishedAt: daysAgo(70),
  },
  "Ama's Kitchen": {
    genres: ['comedy-romantic-comedy', 'family-family-comedy'],
    tags: ['heartwarming', 'friendship', 'feel-good'],
    collections: ['hidden-gems'],
    audience: 'FAMILY', ageRating: 'PG', ratingJurisdiction: 'GH', releaseDate: '2025-08-15',
    productionCountries: ['GH'], originalLanguages: ['tw', 'en'], audioLanguages: ['en', 'tw'],
    publishedAt: daysAgo(15),
  },
  'King of Oyo': {
    genres: ['history-historical-drama', 'drama'],
    tags: ['royalty', 'betrayal', 'revenge', 'tradition', 'power'],
    collections: ['award-winning', 'critically-acclaimed', 'classic-cinema'],
    audience: 'ADULTS', releaseDate: '2008-06-01', productionCountries: ['NG'],
    originalLanguages: ['yo'], audioLanguages: ['yo', 'en'], publishedAt: daysAgo(300),
  },
  'Kano Nights': {
    genres: ['romance-teen-romance', 'teen-young-adult-school'],
    tags: ['romantic', 'school-campus', 'tradition'],
    audience: 'TEENS', releaseDate: '2026-08-10', productionCountries: ['NG'],
    originalLanguages: ['ha'], audioLanguages: ['ha', 'en'],
    availableUntil: new Date(Date.now() + 20 * 86_400_000).toISOString(), publishedAt: daysAgo(30),
  },
  'Bombay to Lagos': {
    genres: ['comedy-romantic-comedy', 'romance'],
    tags: ['romantic', 'funny', 'wedding'],
    audience: 'FAMILY', releaseDate: '2025-05-01', productionCountries: ['IN', 'NG'],
    originalLanguages: ['hi', 'en'], audioLanguages: ['en', 'hi'], publishedAt: daysAgo(160),
  },
  'Gidi Republic': {
    genres: ['drama-political-drama', 'politics-political-thriller'],
    tags: ['power', 'corruption', 'ambition', 'strong-female-lead'],
    collections: ['cinnetemple-originals', 'series'],
    audience: 'ADULTS', ageRating: '16', ratingJurisdiction: 'NG', releaseDate: '2026-02-01',
    productionCountries: ['NG'], originalLanguages: ['en'], audioLanguages: ['en'],
    publishedAt: daysAgo(50),
  },
  'Ojuelegba Blues': {
    contentFormat: 'LIMITED_SERIES',
    genres: ['musical-music-drama', 'drama'],
    tags: ['friendship', 'ambition'],
    productionCountries: ['NG'], originalLanguages: ['en', 'pcm'], seriesComplete: true,
  },
};

const classifications = new Map<string, StoredClassification>();
for (const t of [...movies, ...seriesStore.map((s) => s.title)]) {
  classifications.set(t.id, { ...blankClassification(), ...CLASSIFICATION_SEED[t.title] });
}

function stored(id: string): StoredClassification {
  let c = classifications.get(id);
  if (!c) {
    c = blankClassification();
    classifications.set(id, c);
  }
  return c;
}

interface MockSection extends Omit<HomeSectionDto, 'eligibleCount' | 'live'> {}

const sections: MockSection[] = SECTION_SEED.map(
  ([slug, title, kind, sort, rules, minItems, opts], i) => ({
    id: uid(),
    slug,
    title,
    kind,
    rules,
    sort,
    limit: opts?.limit ?? 20,
    minItems,
    enabled: opts?.enabled ?? true,
    position: i + 1,
    pinnedTitleIds: [],
    excludedTitleIds: [],
  }),
);

const collections: TaxonomyCollection[] = COLLECTIONS.map((c) => ({ ...c }));
const GENRE_PARENTS = genreParentMap(GENRES);

const badRequest = (message: string) => new ApiError(400, 'Bad Request', message);

/** Legacy free-text genre names → genre slugs (mirrors ClassificationService.syncLegacy). */
function syncLegacyGenres(id: string, names: string[]): void {
  const slugs: string[] = [];
  for (const n of names) {
    const g = GENRES.find(
      (x) => x.name.toLowerCase() === n.trim().toLowerCase() || x.slug === n.trim().toLowerCase(),
    );
    if (g && !slugs.includes(g.slug)) slugs.push(g.slug);
  }
  const c = stored(id);
  // Keep selected subgenres whose parent is still named.
  c.genres = [
    ...c.genres.filter((s) => s !== GENRE_PARENTS.get(s) && slugs.includes(GENRE_PARENTS.get(s)!)),
    ...slugs.filter((s) => !c.genres.some((g) => g !== s && GENRE_PARENTS.get(g) === s)),
  ];
}

function toDetail(s: MockSeries): AdminSeriesDetail {
  return {
    ...s.title,
    seasonsList: s.seasons.map((se) => ({ ...se, episodes: [...se.episodes] })),
  };
}

export class MockApiClient implements ApiClient {
  async lookupProducer(email: string) {
    const producer = [...this.producers.values()].find(p => p.email === email);
    return { producer: producer ? { id: producer.id ?? '00000000-0000-4000-8000-000000000001', email, name: producer.name } : null };
  }
  private producers = new Map<string, ProducerInfo>();
  async getProducer(id: string) { return { producer: this.producers.get(id) ?? null }; }
  async assignProducer(id: string, body: ProducerInput) {
    const producer = { ...body, name: body.name ?? null, linkSentAt: new Date().toISOString(), lastSeenAt: null };
    this.producers.set(id, producer); return producer;
  }
  async resendProducer(id: string) {
    const producer = this.producers.get(id);
    if (!producer) throw new Error('No producer assigned');
    return this.assignProducer(id, { ...producer, name: producer.name ?? undefined });
  }

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
    if (body.status === 'published' && !stored(id).publishedAt) stored(id).publishedAt = new Date().toISOString();
    if (body.genres) syncLegacyGenres(id, body.genres);
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
    if (body.status === 'published' && !stored(id).publishedAt) stored(id).publishedAt = new Date().toISOString();
    if (body.genres) syncLegacyGenres(id, body.genres);
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

  async completeMultipartUpload(key: string): Promise<{ stored: boolean; key: string }> {
    await delay(80);
    return { stored: true, key };
  }

  async abortMultipartUpload(key: string): Promise<{ aborted: boolean; key: string }> {
    await delay(40);
    return { aborted: true, key };
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

  async listCoinTopups() { return { total: 0, items: [] }; }

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

  // ── classification + homepage ─────────────────────────────────────────────
  async getTaxonomy(): Promise<Taxonomy> {
    await delay(120);
    return {
      genres: GENRES.map((g) => ({ ...g, subgenres: [...g.subgenres] })),
      tags: TAGS.map((t) => ({ ...t })),
      industries: INDUSTRIES.map(({ slug, name }) => ({ slug, name })),
      collections: collections.map((c) => ({ ...c })),
      formats: [...FORMATS],
      audiences: [...AUDIENCES],
      accessTypes: [...ACCESS_TYPES],
      languages: [...LANGUAGES],
      decades: [...DECADES],
    };
  }

  private findTitle(id: string): { title: AdminTitle; series?: MockSeries } {
    const m = movies.find((x) => x.id === id);
    if (m) return { title: m };
    const s = seriesStore.find((x) => x.title.id === id);
    if (s) return { title: s.title, series: s };
    throw new ApiError(404, 'Not Found', 'Title not found');
  }

  private autoIndustries(c: StoredClassification): string[] {
    return deriveIndustries(c.productionCountries, c.originalLanguages, INDUSTRIES).filter(
      (slug) => !c.manualIndustries.includes(slug),
    );
  }

  private candidate(title: AdminTitle, series?: MockSeries): MockCandidate {
    const c = stored(title.id);
    const playable = series
      ? series.seasons.some((se) => se.episodes.some((e) => e.hasVideo))
      : title.videoKey != null;
    const ts = (v: string | null) => (v ? Date.parse(v) : null);
    return {
      id: title.id,
      type: title.type,
      published: title.status === 'published',
      playable,
      format: effectiveFormat(title.type, c.contentFormat),
      genres: c.genres,
      tags: c.tags,
      collections: c.collections,
      industries: [...c.manualIndustries, ...this.autoIndustries(c)],
      audience: c.audience,
      access: effectiveAccess(c.accessType, title.priceMinor),
      runtimeMinutes: series
        ? null
        : (title.runtimeMinutes ??
          (title.durationSeconds != null ? Math.round(title.durationSeconds / 60) : null)),
      releaseDate: c.releaseDate ? Date.parse(`${c.releaseDate}T00:00:00Z`) : Date.UTC(title.year, 0, 1),
      publishedAt: title.status === 'published' ? (ts(c.publishedAt) ?? Date.now()) : null,
      isPremiere: title.isPremiere,
      premiereStartAt: ts(title.premiereStartAt),
      availableFrom: ts(c.availableFrom),
      availableUntil: ts(c.availableUntil),
      seriesComplete: c.seriesComplete,
      latestEpisodeAt: playable && series ? Date.now() - 5 * 86_400_000 : null,
      // Plays are faked from popularity so the plays-based rows have data.
      plays1d: title.popularity >= 90 ? Math.round(title.popularity / 30) : 0,
      plays7d: title.popularity >= 75 ? Math.round(title.popularity / 8) : 0,
      playsAll: title.popularity * 3,
      popularity: title.popularity,
      rating: title.rating,
      summary: {
        id: title.id,
        type: title.type,
        title: title.title,
        year: title.year,
        rating: title.rating,
        genres: title.genres,
        posterUrl: title.posterUrl,
      },
    };
  }

  private candidates(): MockCandidate[] {
    return [
      ...movies.map((m) => this.candidate(m)),
      ...seriesStore.map((s) => this.candidate(s.title, s)),
    ];
  }

  private classificationDto(id: string): ClassificationDto {
    const { title, series } = this.findTitle(id);
    const c = stored(id);
    const now = Date.now();
    const cand = this.candidate(title, series);
    const name = (slug: string) => INDUSTRIES.find((i) => i.slug === slug)?.name ?? slug;
    return {
      titleId: id,
      type: title.type,
      contentFormat: c.contentFormat,
      effectiveFormat: cand.format,
      genres: [...c.genres],
      tags: [...c.tags],
      collections: [...c.collections],
      industries: [
        ...c.manualIndustries.map((slug) => ({ slug, name: name(slug), source: 'manual' as const })),
        ...this.autoIndustries(c).map((slug) => ({ slug, name: name(slug), source: 'auto' as const })),
      ],
      audience: c.audience,
      ageRating: c.ageRating,
      ratingJurisdiction: c.ratingJurisdiction,
      releaseDate: c.releaseDate,
      accessType: c.accessType,
      effectiveAccess: cand.access,
      productionCountries: [...c.productionCountries],
      originalLanguages: [...c.originalLanguages],
      audioLanguages: [...c.audioLanguages],
      availableFrom: c.availableFrom,
      availableUntil: c.availableUntil,
      seriesComplete: c.seriesComplete,
      placement: sections
        .filter((s) => s.enabled && s.kind === 'RULE')
        .filter((s) => !s.excludedTitleIds.includes(id))
        .filter((s) => matchesRules(cand, s.rules, now, GENRE_PARENTS))
        .map((s) => {
          const reason = baseEligibility(cand, now, sectionIsUpcoming(s.rules));
          return reason
            ? { slug: s.slug, title: s.title, eligible: false, reason }
            : { slug: s.slug, title: s.title, eligible: true };
        }),
    };
  }

  async getClassification(titleId: string): Promise<ClassificationDto> {
    await delay(140);
    return this.classificationDto(titleId);
  }

  async updateClassification(
    titleId: string,
    input: ClassificationInput,
  ): Promise<ClassificationDto> {
    await delay();
    const { title } = this.findTitle(titleId);
    const known = {
      genres: new Set(GENRES.flatMap((g) => [g.slug, ...g.subgenres.map((s) => s.slug)])),
      tags: new Set(TAGS.map((t) => t.slug)),
      collections: new Set(collections.map((c) => c.slug)),
      industries: new Set(INDUSTRIES.map((i) => i.slug)),
    };
    for (const key of ['genres', 'tags', 'collections', 'industries'] as const) {
      const unknown = (input[key] ?? []).filter((slug) => !known[key].has(slug));
      if (unknown.length) throw badRequest(`Unknown ${key}: ${unknown.join(', ')}`);
    }
    const countries = input.productionCountries?.map((c) => c.toUpperCase());
    const badCountries = (countries ?? []).filter((c) => normalizeCountryCode(c) !== c);
    if (badCountries.length) throw badRequest(`Invalid country codes: ${badCountries.join(', ')}`);
    const original = input.originalLanguages?.map((l) => l.toLowerCase());
    const audio = input.audioLanguages?.map((l) => l.toLowerCase());
    const badLangs = [...(original ?? []), ...(audio ?? [])].filter(
      (l) => normalizeLanguageCode(l) !== l,
    );
    if (badLangs.length) throw badRequest(`Invalid language codes: ${badLangs.join(', ')}`);
    if (input.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.releaseDate))
      throw badRequest('releaseDate must be YYYY-MM-DD');
    const c = stored(titleId);
    const from = input.availableFrom !== undefined ? input.availableFrom : c.availableFrom;
    const until = input.availableUntil !== undefined ? input.availableUntil : c.availableUntil;
    if (from && until && Date.parse(until) <= Date.parse(from))
      throw badRequest('availableUntil must be after availableFrom');

    if (input.contentFormat !== undefined) c.contentFormat = input.contentFormat;
    if (input.genres) c.genres = [...new Set(input.genres)];
    if (input.tags) c.tags = [...new Set(input.tags)];
    if (input.collections) c.collections = [...new Set(input.collections)];
    if (input.industries) c.manualIndustries = [...new Set(input.industries)];
    if (input.audience !== undefined) c.audience = input.audience;
    if (input.ageRating !== undefined) c.ageRating = input.ageRating;
    if (input.ratingJurisdiction !== undefined) c.ratingJurisdiction = input.ratingJurisdiction;
    if (input.releaseDate !== undefined) c.releaseDate = input.releaseDate;
    if (input.accessType !== undefined) c.accessType = input.accessType;
    if (countries) c.productionCountries = [...new Set(countries)];
    if (original) c.originalLanguages = [...new Set(original)];
    if (audio) c.audioLanguages = [...new Set(audio)];
    c.availableFrom = from;
    c.availableUntil = until;
    if (input.seriesComplete !== undefined && title.type === 'series')
      c.seriesComplete = input.seriesComplete;

    // Mirror legacy columns, as the server does.
    title.genres = legacyGenreNames(c.genres, GENRES);
    title.categories = [...new Set([...c.collections, 'new-listings'])];
    return this.classificationDto(titleId);
  }

  private computeHome(): {
    dtos: HomeSectionDto[];
    preview: HomePreview;
  } {
    const now = Date.now();
    const candidates = this.candidates();
    const ordered = [...sections].sort((a, b) => a.position - b.position);
    const preview: HomePreview = { rows: [], hidden: [] };
    const dtos: HomeSectionDto[] = [];
    for (const s of ordered) {
      if (s.kind !== 'RULE') {
        dtos.push({ ...s, eligibleCount: null, live: false });
        preview.hidden.push({
          slug: s.slug,
          title: s.title,
          reason: s.enabled ? "Shown in the app's own rail" : 'Disabled',
        });
        continue;
      }
      const built = buildSection(s, candidates, now, GENRE_PARENTS);
      let reason: string | null = null;
      if (!s.enabled) reason = 'Disabled';
      else if (built.eligibleCount < s.minItems)
        reason = `Only ${built.eligibleCount} of ${s.minItems} titles`;
      else if (preview.rows.length >= HOME_MAX_ROWS) reason = `Over the ${HOME_MAX_ROWS}-row limit`;
      if (reason) preview.hidden.push({ slug: s.slug, title: s.title, reason });
      else
        preview.rows.push({
          slug: s.slug,
          title: s.title,
          count: built.eligibleCount,
          items: built.items.map((c) => c.summary),
        });
      dtos.push({ ...s, eligibleCount: built.eligibleCount, live: reason === null });
    }
    return {
      dtos: dtos.map((d) => ({
        ...d,
        rules: structuredClone(d.rules),
        pinnedTitleIds: [...d.pinnedTitleIds],
        excludedTitleIds: [...d.excludedTitleIds],
      })),
      preview,
    };
  }

  async listHomeSections(): Promise<HomeSectionDto[]> {
    await delay(160);
    return this.computeHome().dtos;
  }

  async updateHomeSection(id: string, patch: HomeSectionPatch): Promise<HomeSectionDto> {
    await delay();
    const s = sections.find((x) => x.id === id);
    if (!s) throw new ApiError(404, 'Not Found', 'Section not found');
    if (patch.title !== undefined && !patch.title.trim()) throw badRequest('title must not be empty');
    if (patch.sort !== undefined && !HOME_SORTS.includes(patch.sort))
      throw badRequest(`sort must be one of the following values: ${HOME_SORTS.join(', ')}`);
    for (const key of ['limit', 'minItems'] as const) {
      const v = patch[key];
      if (v !== undefined && (!Number.isInteger(v) || v < 1 || v > 50))
        throw badRequest(`${key} must be an integer from 1 to 50`);
    }
    // Same validator (and 400 wording) as AdminHomeService.updateSection.
    let rules: SectionRules | undefined;
    if (patch.rules !== undefined) {
      try {
        rules = parseSectionRules(patch.rules);
      } catch (err) {
        throw badRequest(`Invalid rules: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const pinned = patch.pinnedTitleIds && [...new Set(patch.pinnedTitleIds)];
    const excluded = patch.excludedTitleIds && [...new Set(patch.excludedTitleIds)];
    const ids = new Set(this.candidates().map((c) => c.id));
    const missing = [...(pinned ?? []), ...(excluded ?? [])].filter((x) => !ids.has(x));
    if (missing.length) throw badRequest(`Unknown title ids: ${missing.join(', ')}`);
    const both = (pinned ?? s.pinnedTitleIds).filter((x) => (excluded ?? s.excludedTitleIds).includes(x));
    if (both.length) throw badRequest(`Titles cannot be both pinned and excluded: ${both.join(', ')}`);

    if (patch.title !== undefined) s.title = patch.title.trim();
    if (patch.enabled !== undefined) s.enabled = patch.enabled;
    if (patch.sort !== undefined) s.sort = patch.sort;
    if (patch.limit !== undefined) s.limit = patch.limit;
    if (patch.minItems !== undefined) s.minItems = patch.minItems;
    if (rules) s.rules = rules;
    if (pinned) s.pinnedTitleIds = pinned;
    if (excluded) s.excludedTitleIds = excluded;
    return this.computeHome().dtos.find((d) => d.id === id)!;
  }

  async reorderHomeSections(ids: string[]): Promise<HomeSectionDto[]> {
    await delay();
    const all = new Set(sections.map((s) => s.id));
    if (ids.length !== all.size || new Set(ids).size !== ids.length || ids.some((x) => !all.has(x)))
      throw badRequest('ids must list every section exactly once');
    ids.forEach((id, i) => {
      sections.find((s) => s.id === id)!.position = i + 1;
    });
    return this.computeHome().dtos;
  }

  async getHomePreview(): Promise<HomePreview> {
    await delay(260);
    return this.computeHome().preview;
  }

  async createCollection(body: CollectionCreate): Promise<TaxonomyCollection> {
    await delay();
    if (!SLUG_RE.test(body.slug)) throw badRequest('slug must be lower-case words joined by -');
    if (!body.name.trim()) throw badRequest('name must not be empty');
    if (collections.some((c) => c.slug === body.slug))
      throw new ApiError(409, 'Conflict', `Collection ${body.slug} already exists`);
    const created: TaxonomyCollection = {
      slug: body.slug,
      name: body.name.trim(),
      kind: 'EDITORIAL',
      description: body.description ?? null,
    };
    collections.push(created);
    return { ...created };
  }

  async updateCollection(slug: string, body: CollectionUpdate): Promise<TaxonomyCollection> {
    await delay();
    const c = collections.find((x) => x.slug === slug);
    if (!c) throw new ApiError(404, 'Not Found', 'Collection not found');
    if (body.name !== undefined) {
      if (!body.name.trim()) throw badRequest('name must not be empty');
      c.name = body.name.trim();
    }
    if (body.description !== undefined) c.description = body.description;
    return { ...c };
  }
}
