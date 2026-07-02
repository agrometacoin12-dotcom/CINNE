export * from './auth.contracts';
export * from './catalogue.contracts';

/** Current API version prefix. */
export const API_VERSION = 'v1' as const;

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
    presign: '/v1/admin/uploads/presign',
    users: '/v1/admin/users',
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
  },
  premieres: {
    root: '/v1/premieres',
    room: (id: string) => `/v1/premieres/${id}/room`,
    chat: (id: string) => `/v1/premieres/${id}/chat`,
  },
  health: '/v1/health',
} as const;
