import {
  ApiRoutes,
  type BrowseResponse,
  type Me,
  type SearchResponse,
  type Title,
  type TokenPair,
  type WatchlistItem,
} from '@cinnetemple/shared';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

const ACCESS_KEY = 'ct.access';
const REFRESH_KEY = 'ct.refresh';

/** Lightweight token store. Access token kept in memory; refresh persisted. */
export const tokenStore = {
  access: null as string | null,
  get refresh(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(REFRESH_KEY);
  },
  set(pair: TokenPair) {
    this.access = pair.accessToken;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACCESS_KEY, pair.accessToken);
      window.localStorage.setItem(REFRESH_KEY, pair.refreshToken);
    }
  },
  hydrate() {
    if (typeof window !== 'undefined') {
      this.access = window.localStorage.getItem(ACCESS_KEY);
    }
  },
  clear() {
    this.access = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ACCESS_KEY);
      window.localStorage.removeItem(REFRESH_KEY);
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  /** internal: prevents infinite refresh recursion */
  _retried?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth && tokenStore.access) {
    headers.Authorization = `Bearer ${tokenStore.access}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });

  // Transparent refresh-token rotation on a single 401.
  if (res.status === 401 && opts.auth && !opts._retried && tokenStore.refresh) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, { ...opts, _retried: true });
    }
  }

  if (!res.ok) {
    const problem = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      problem.title ?? 'Error',
      problem.detail ?? problem.message ?? `Request failed (${res.status})`,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}${ApiRoutes.auth.refresh}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      tokenStore.clear();
      return false;
    }
    tokenStore.set((await res.json()) as TokenPair);
    return true;
  } catch {
    return false;
  }
}

/** Typed API surface for Phase 1 auth. */
export const api = {
  register: (body: { email: string; password: string; displayName: string }) =>
    request<{ userId: string; status: string }>(ApiRoutes.auth.register, {
      method: 'POST',
      body,
    }),

  verifyEmail: (body: { email: string; code: string }) =>
    request<{ verified: boolean }>(ApiRoutes.auth.verifyEmail, { method: 'POST', body }),

  login: async (body: { email: string; password: string; deviceId?: string }) => {
    const pair = await request<TokenPair>(ApiRoutes.auth.login, { method: 'POST', body });
    tokenStore.set(pair);
    return pair;
  },

  forgotPassword: (body: { email: string }) =>
    request<{ message: string }>(ApiRoutes.auth.forgotPassword, { method: 'POST', body }),

  resetPassword: (body: { email: string; code: string; newPassword: string }) =>
    request<{ success: boolean }>(ApiRoutes.auth.resetPassword, { method: 'POST', body }),

  me: () => request<Me>(ApiRoutes.auth.me, { auth: true }),

  updateProfile: (body: {
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
    locale?: string;
  }) => request<unknown>(ApiRoutes.profile.update, { method: 'PATCH', body, auth: true }),

  sessions: () =>
    request<
      Array<{
        id: string;
        deviceId: string | null;
        userAgent: string | null;
        ip: string | null;
        createdAt: string;
        expiresAt: string;
      }>
    >(ApiRoutes.sessions.list, { auth: true }),

  revokeSession: (id: string) =>
    request<{ success: boolean }>(`${ApiRoutes.sessions.list}/${id}`, {
      method: 'DELETE',
      auth: true,
    }),

  // ── Catalogue (public) ────────────────────────────────────────────────
  browse: () => request<BrowseResponse>(ApiRoutes.catalogue.browse),

  searchCatalogue: (q: string) =>
    request<SearchResponse>(`${ApiRoutes.catalogue.search}?q=${encodeURIComponent(q)}`),

  title: (id: string) => request<Title>(ApiRoutes.catalogue.title(id)),

  // ── Watchlist (authenticated) ─────────────────────────────────────────
  watchlist: () => request<WatchlistItem[]>(ApiRoutes.watchlist.root, { auth: true }),

  addToWatchlist: (titleId: string) =>
    request<{ success: boolean }>(ApiRoutes.watchlist.root, {
      method: 'POST',
      body: { titleId },
      auth: true,
    }),

  removeFromWatchlist: (titleId: string) =>
    request<{ success: boolean }>(`${ApiRoutes.watchlist.root}/${titleId}`, {
      method: 'DELETE',
      auth: true,
    }),

  logout: async () => {
    const refreshToken = tokenStore.refresh;
    if (refreshToken) {
      await request<unknown>(ApiRoutes.auth.logout, {
        method: 'POST',
        body: { refreshToken },
        auth: true,
      }).catch(() => undefined);
    }
    tokenStore.clear();
  },
};
