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
  health: '/v1/health',
} as const;
