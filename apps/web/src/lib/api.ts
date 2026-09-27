import {
  ApiRoutes,
  type AdminAuditResponse,
  type AdminPurchasesResponse,
  type AdminStats,
  type AdminTitle,
  type AdminUser,
  type AdminUsersResponse,
  type BrowseResponse,
  type ContinueWatchingItem,
  type PlaybackProgressItem,
  type ChatMessage,
  type Entitlement,
  type Me,
  type PlaybackSession,
  type PremiereRoom,
  type PurchaseResult,
  type SearchResponse,
  type Title,
  type TokenPair,
  type WatchlistItem,
  type FundingPool,
  type FundingPoolDetail,
  type PayoutPlan,
  type TopupResult,
  type TopupStart,
  type TransferResult,
  type WalletSummary,
  type AdminProducerWithdrawal,
  type ProducerDashboard,
  type TitleProducer,
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
  /** Extra request headers (e.g. the producer dashboard key). */
  headers?: Record<string, string>;
  /** internal: prevents infinite refresh recursion */
  _retried?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...opts.headers };
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

  /** Issue a single-use desktop-link authorization code (PKCE-style). */
  createDesktopAuthCode: (body: { challenge: string }) =>
    request<{ code: string; expiresInSeconds: number }>('/v1/auth/desktop/code', {
      method: 'POST',
      body,
      auth: true,
    }),

  // ── Admin (admin role required) ───────────────────────────────────────────
  adminListMovies: () => request<AdminTitle[]>(ApiRoutes.admin.movies, { auth: true }),

  adminGetMovie: (id: string) => request<AdminTitle>(ApiRoutes.admin.movie(id), { auth: true }),

  adminCreateMovie: (body: Record<string, unknown>) =>
    request<AdminTitle>(ApiRoutes.admin.movies, { method: 'POST', body, auth: true }),

  adminUpdateMovie: (id: string, body: Record<string, unknown>) =>
    request<AdminTitle>(ApiRoutes.admin.movie(id), { method: 'PATCH', body, auth: true }),

  adminSetFeatured: (id: string, featured: boolean) =>
    request<AdminTitle>(ApiRoutes.admin.featured(id), {
      method: 'PUT',
      body: { featured },
      auth: true,
    }),

  adminSetPremiere: (id: string, isPremiere: boolean, premiereStartAt?: string) =>
    request<AdminTitle>(ApiRoutes.admin.premiere(id), {
      method: 'PUT',
      body: { isPremiere, premiereStartAt },
      auth: true,
    }),

  adminUsers: (q?: string, take?: number, skip?: number) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (take != null) params.set('take', String(take));
    if (skip != null) params.set('skip', String(skip));
    const qs = params.toString();
    return request<AdminUsersResponse>(`${ApiRoutes.admin.users}${qs ? `?${qs}` : ''}`, {
      auth: true,
    });
  },

  adminDeleteMovie: (id: string) =>
    request<{ deleted: boolean; id: string; soldTickets: number }>(ApiRoutes.admin.movie(id), {
      method: 'DELETE',
      auth: true,
    }),

  adminSetUserRoles: (id: string, roles: string[]) =>
    request<AdminUser>(ApiRoutes.admin.userRoles(id), {
      method: 'PUT',
      body: { roles },
      auth: true,
    }),

  adminSetUserStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED') =>
    request<AdminUser>(ApiRoutes.admin.userStatus(id), {
      method: 'PUT',
      body: { status },
      auth: true,
    }),

  adminVerifyUser: (id: string) =>
    request<AdminUser>(ApiRoutes.admin.userVerify(id), { method: 'POST', auth: true }),

  adminPurchases: (opts?: {
    q?: string;
    titleId?: string;
    status?: string;
    take?: number;
    skip?: number;
  }) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set('q', opts.q);
    if (opts?.titleId) params.set('titleId', opts.titleId);
    if (opts?.status) params.set('status', opts.status);
    if (opts?.take != null) params.set('take', String(opts.take));
    if (opts?.skip != null) params.set('skip', String(opts.skip));
    const qs = params.toString();
    return request<AdminPurchasesResponse>(`${ApiRoutes.admin.purchases}${qs ? `?${qs}` : ''}`, {
      auth: true,
    });
  },

  adminAudit: (take?: number, skip?: number) => {
    const params = new URLSearchParams();
    if (take != null) params.set('take', String(take));
    if (skip != null) params.set('skip', String(skip));
    const qs = params.toString();
    return request<AdminAuditResponse>(`${ApiRoutes.admin.audit}${qs ? `?${qs}` : ''}`, {
      auth: true,
    });
  },

  adminUploadStat: (key: string) =>
    request<{ exists: boolean; size: number }>(
      `${ApiRoutes.admin.uploadStat}?key=${encodeURIComponent(key)}`,
      { auth: true },
    ),

  adminStats: () => request<AdminStats>(ApiRoutes.admin.stats, { auth: true }),

  adminPresign: (kind: 'video' | 'poster' | 'hero', contentType: string) =>
    request<{
      enabled: boolean;
      key: string;
      uploadUrl: string | null;
      headers: Record<string, string>;
    }>(ApiRoutes.admin.presign, { method: 'POST', body: { kind, contentType }, auth: true }),

  // ── Commerce (pay-per-view + gifting) ──────────────────────────────────────
  purchase: (titleId: string, beneficiaryEmail?: string) =>
    request<PurchaseResult>(ApiRoutes.commerce.purchases, {
      method: 'POST',
      body: { titleId, beneficiaryEmail },
      auth: true,
    }),

  verifyPurchase: (reference: string) =>
    request<{ status: string; titleId: string }>(
      `${ApiRoutes.commerce.verify}?reference=${encodeURIComponent(reference)}`,
      { auth: true },
    ),

  entitlements: () => request<Entitlement[]>(ApiRoutes.commerce.entitlements, { auth: true }),

  // ── Coins & funding (1 coin = ₦1) ─────────────────────────────────────
  wallet: () => request<WalletSummary>(ApiRoutes.wallet.root, { auth: true }),

  buyCoins: (coins: number) =>
    request<TopupStart>(ApiRoutes.wallet.topups, { method: 'POST', body: { coins }, auth: true }),

  verifyTopup: (reference: string) =>
    request<TopupResult>(
      `${ApiRoutes.wallet.verifyTopup}?reference=${encodeURIComponent(reference)}`,
      { auth: true },
    ),

  sendCoins: (body: {
    recipientEmail: string;
    coins: number;
    idempotencyKey: string;
    note?: string;
  }) => request<TransferResult>(ApiRoutes.wallet.transfers, { method: 'POST', body, auth: true }),

  fundingPools: () => request<FundingPool[]>(ApiRoutes.funding.pools),

  fundingPool: (id: string, signedIn: boolean) =>
    signedIn
      ? request<FundingPoolDetail>(ApiRoutes.funding.mine(id), { auth: true })
      : request<FundingPoolDetail>(ApiRoutes.funding.pool(id)),

  fundPool: (id: string, coins: number, idempotencyKey: string) =>
    request<FundingPoolDetail>(ApiRoutes.funding.contribute(id), {
      method: 'POST',
      body: { coins, idempotencyKey },
      auth: true,
    }),

  claimPoolRefund: (id: string) =>
    request<{ refundedCoins: number; pool: FundingPoolDetail }>(ApiRoutes.funding.refund(id), {
      method: 'POST',
      auth: true,
    }),

  // ── Producer dashboard (key from the private link, not a viewer login) ──
  producerDashboard: (key: string) =>
    request<ProducerDashboard>(ApiRoutes.producer.dashboard, {
      headers: { 'x-producer-key': key },
    }),

  producerRequestWithdrawal: (
    key: string,
    body: { amountNaira: number; bankName: string; accountNumber: string; accountName: string },
  ) =>
    request<{ id: string; expiresAt: string }>(ApiRoutes.producer.withdrawals, {
      method: 'POST',
      body,
      headers: { 'x-producer-key': key },
    }),

  producerConfirmWithdrawal: (key: string, id: string, code: string) =>
    request<ProducerDashboard>(ApiRoutes.producer.confirmWithdrawal(id), {
      method: 'POST',
      body: { code },
      headers: { 'x-producer-key': key },
    }),

  adminTitleProducer: (titleId: string) =>
    request<{ producer: TitleProducer | null }>(ApiRoutes.producer.adminForTitle(titleId), {
      auth: true,
    }),

  adminAssignProducer: (
    titleId: string,
    body: { email: string; name?: string; revenueShareBps?: number },
  ) =>
    request<TitleProducer>(ApiRoutes.producer.adminForTitle(titleId), {
      method: 'PUT',
      body,
      auth: true,
    }),

  adminResendProducerLink: (titleId: string) =>
    request<TitleProducer>(ApiRoutes.producer.adminResend(titleId), { method: 'POST', auth: true }),

  adminProducerWithdrawals: (status?: 'REQUESTED' | 'PAID' | 'REJECTED') =>
    request<AdminProducerWithdrawal[]>(
      `${ApiRoutes.producer.adminWithdrawals}${status ? `?status=${status}` : ''}`,
      { auth: true },
    ),

  adminMarkWithdrawalPaid: (id: string, transferRef: string) =>
    request<AdminProducerWithdrawal>(ApiRoutes.producer.adminPaid(id), {
      method: 'POST',
      body: { transferRef },
      auth: true,
    }),

  adminRejectWithdrawal: (id: string, note: string) =>
    request<AdminProducerWithdrawal>(ApiRoutes.producer.adminReject(id), {
      method: 'POST',
      body: { note },
      auth: true,
    }),

  adminFundingPools: () => request<FundingPool[]>(ApiRoutes.funding.adminPools, { auth: true }),

  adminCreatePool: (body: {
    name: string;
    description?: string;
    titleId?: string;
    goalCoins?: number;
    closesAt?: string;
  }) => request<FundingPool>(ApiRoutes.funding.adminPools, { method: 'POST', body, auth: true }),

  adminClosePool: (id: string) =>
    request<FundingPoolDetail>(ApiRoutes.funding.adminClose(id), { method: 'POST', auth: true }),

  adminPreviewPayout: (id: string, payoutCoins: number) =>
    request<PayoutPlan>(ApiRoutes.funding.adminPreview(id, payoutCoins), { auth: true }),

  adminPayout: (id: string, payoutCoins: number) =>
    request<PayoutPlan>(ApiRoutes.funding.adminPayout(id), {
      method: 'POST',
      body: { payoutCoins },
      auth: true,
    }),

  adminCancelPool: (id: string) =>
    request<{ refundedBackers: number; refundedCoins: number }>(ApiRoutes.funding.adminCancel(id), {
      method: 'POST',
      auth: true,
    }),

  // ── Playback ────────────────────────────────────────────────────────────────
  playbackStart: (titleId: string) =>
    request<PlaybackSession>(ApiRoutes.playback.start(titleId), { method: 'POST', auth: true }),

  playbackStatus: (titleId: string) =>
    request<{
      titleId: string;
      hasAccess: boolean;
      started: boolean;
      expiresAt: string | null;
      premiere: boolean;
      premiereLive: boolean;
      premiereStartAt: string | null;
    }>(ApiRoutes.playback.status(titleId), { auth: true }),

  playbackSaveProgress: (titleId: string, positionSeconds: number, durationSeconds: number) =>
    request<PlaybackProgressItem>(ApiRoutes.playback.progress(titleId), {
      method: 'PUT',
      body: { positionSeconds, durationSeconds },
      auth: true,
    }),

  playbackContinue: () =>
    request<ContinueWatchingItem[]>(ApiRoutes.playback.continue, { auth: true }),

  playbackClearProgress: (titleId: string) =>
    request<{ titleId: string; cleared: boolean }>(ApiRoutes.playback.progress(titleId), {
      method: 'DELETE',
      auth: true,
    }),

  // ── Premiere live chat ────────────────────────────────────────────────────
  premieres: () => request<Title[]>(ApiRoutes.premieres.root),

  premiereRoom: (titleId: string) =>
    request<PremiereRoom>(ApiRoutes.premieres.room(titleId), { auth: true }),

  premiereChat: (titleId: string, since?: string) =>
    request<ChatMessage[]>(
      `${ApiRoutes.premieres.chat(titleId)}${since ? `?since=${encodeURIComponent(since)}` : ''}`,
      { auth: true },
    ),

  postPremiereChat: (titleId: string, body: string) =>
    request<ChatMessage>(ApiRoutes.premieres.chat(titleId), {
      method: 'POST',
      body: { body },
      auth: true,
    }),
};

/** Format a minor-unit price (e.g. kobo) into a display string. */
export function formatPrice(minor: number, currency: string): string {
  if (minor <= 0) return 'Free';
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

/** Coins display: "12,500 coins". 1 coin = ₦1. */
export function formatCoins(coins: number): string {
  return `${coins.toLocaleString('en-NG')} ${Math.abs(coins) === 1 ? 'coin' : 'coins'}`;
}

/** Kobo → "₦12,500" (whole naira, floored). */
export function formatKobo(minor: number): string {
  return `₦${Math.floor(minor / 100).toLocaleString('en-NG')}`;
}

/** Naira display without decimals: "₦12,500". */
export function formatNaira(naira: number): string {
  return `₦${Math.round(naira).toLocaleString('en-NG')}`;
}

/** One per submit attempt, so a double-tap on Send/Fund lands once. */
export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
