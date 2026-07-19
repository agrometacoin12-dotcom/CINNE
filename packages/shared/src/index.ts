export * from './auth.contracts';
export * from './catalogue.contracts';

/** Current API version prefix. */
export const API_VERSION = 'v1' as const;

/**
 * Catalogue browse rows, in display order. Mirrors the backend's canonical
 * list (title.entity.ts); the admin UI uses it so category slugs can't drift.
 */
export const BROWSE_ROWS: { slug: string; title: string }[] = [
  { slug: 'new-listings', title: 'New Listings' },
  { slug: 'trending', title: 'Trending now' },
  { slug: 'most-watched', title: 'Most watched' },
  { slug: 'coming-soon', title: 'Coming soon' },
  { slug: 'new-releases', title: 'New releases' },
  { slug: 'acclaimed', title: 'Critically acclaimed' },
  { slug: 'series', title: 'Binge-worthy series' },
];

/** Stable list of API route paths, consumed by clients to avoid string drift. */
export const ApiRoutes = {
  auth: {
    register: '/v1/auth/register',
    verifyEmail: '/v1/auth/verify-email',
    login: '/v1/auth/login',
    refresh: '/v1/auth/refresh',
    logout: '/v1/auth/logout',
    forgotPassword: '/v1/auth/forgot-password',
    resetPassword: '/v1/auth/reset-password',
    me: '/v1/auth/me',
    desktopCode: '/v1/auth/desktop/code',
    desktopExchange: '/v1/auth/desktop/exchange',
  },
  profile: { update: '/v1/profile' },
  sessions: { list: '/v1/sessions' },
  catalogue: {
    browse: '/v1/catalogue/browse',
    title: (id: string) => `/v1/catalogue/titles/${id}`,
    search: '/v1/catalogue/search',
  },
  watchlist: { root: '/v1/watchlist' },
  admin: {
    movies: '/v1/admin/movies',
    movie: (id: string) => `/v1/admin/movies/${id}`,
    featured: (id: string) => `/v1/admin/movies/${id}/featured`,
    premiere: (id: string) => `/v1/admin/movies/${id}/premiere`,
    series: '/v1/admin/series',
    seriesDetail: (id: string) => `/v1/admin/series/${id}`,
    seriesSeasons: (id: string) => `/v1/admin/series/${id}/seasons`,
    season: (seasonId: string) => `/v1/admin/seasons/${seasonId}`,
    seasonEpisodes: (seasonId: string) => `/v1/admin/seasons/${seasonId}/episodes`,
    episode: (episodeId: string) => `/v1/admin/episodes/${episodeId}`,
    presign: '/v1/admin/uploads/presign',
    uploadStat: '/v1/admin/uploads/stat',
    users: '/v1/admin/users',
    userRoles: (id: string) => `/v1/admin/users/${id}/roles`,
    userStatus: (id: string) => `/v1/admin/users/${id}/status`,
    userVerify: (id: string) => `/v1/admin/users/${id}/verify`,
    purchases: '/v1/admin/purchases',
    audit: '/v1/admin/audit',
    stats: '/v1/admin/stats',
  },
  commerce: {
    purchases: '/v1/purchases',
    apple: '/v1/purchases/apple',
    verify: '/v1/purchases/verify',
    entitlements: '/v1/entitlements',
    webhook: '/v1/payments/webhook',
  },
  playback: {
    start: (id: string) => `/v1/playback/${id}/start`,
    status: (id: string) => `/v1/playback/${id}/status`,
    progress: (id: string) => `/v1/playback/${id}/progress`,
    continue: '/v1/playback/continue',
  },
  premieres: {
    root: '/v1/premieres',
    room: (id: string) => `/v1/premieres/${id}/room`,
    chat: (id: string) => `/v1/premieres/${id}/chat`,
  },
  health: '/v1/health',
} as const;
