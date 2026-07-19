import { studio } from './bridge';
import type {
  AdminAuditResponse,
  AdminPurchasesResponse,
  AdminSeriesDetail,
  AdminSeriesListResponse,
  AdminStats,
  AdminTitle,
  AdminUser,
  AdminUsersResponse,
  AdminSeason,
  AdminEpisode,
  EpisodeUpsert,
  Me,
  PresignKind,
  PresignResponse,
  SeasonUpsert,
  TitleUpsert,
  TokenPair,
  UploadStatResponse,
} from './types';

export const DEFAULT_API_BASE = 'https://api.cinnetemple.com';
export const WEB_BASE = 'https://www.cinnetemple.com';
const API_BASE_KEY = 'studio.apiBase';

export function getApiBase(): string {
  return window.localStorage.getItem(API_BASE_KEY) ?? DEFAULT_API_BASE;
}

export function setApiBase(base: string): void {
  const trimmed = base.trim().replace(/\/+$/, '');
  if (trimmed === '' || trimmed === DEFAULT_API_BASE) {
    window.localStorage.removeItem(API_BASE_KEY);
  } else {
    window.localStorage.setItem(API_BASE_KEY, trimmed);
  }
}

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

/**
 * The full API surface the desktop app consumes. Two implementations:
 * HttpApiClient (production) and MockApiClient (--mock verification mode).
 */
export interface ApiClient {
  // auth
  exchangeDesktopCode(code: string, verifier: string): Promise<TokenPair>;
  me(): Promise<Me>;
  logout(): Promise<void>;
  hasSession(): Promise<boolean>;

  // dashboard
  stats(): Promise<AdminStats>;

  // movies
  listMovies(): Promise<AdminTitle[]>;
  getMovie(id: string): Promise<AdminTitle>;
  createMovie(body: TitleUpsert): Promise<AdminTitle>;
  updateMovie(id: string, body: TitleUpsert): Promise<AdminTitle>;
  deleteMovie(id: string): Promise<{ deleted: boolean; id: string; soldTickets: number }>;
  setFeatured(id: string, featured: boolean): Promise<AdminTitle>;
  setPremiere(id: string, isPremiere: boolean, premiereStartAt?: string): Promise<AdminTitle>;

  // series
  listSeries(opts?: {
    query?: string;
    take?: number;
    skip?: number;
  }): Promise<AdminSeriesListResponse>;
  createSeries(body: TitleUpsert): Promise<AdminTitle>;
  getSeries(id: string): Promise<AdminSeriesDetail>;
  updateSeries(id: string, body: TitleUpsert): Promise<AdminSeriesDetail>;
  deleteSeries(id: string): Promise<{ deleted: boolean; id: string }>;
  createSeason(seriesId: string, body: SeasonUpsert & { number: number }): Promise<AdminSeason>;
  updateSeason(seasonId: string, body: SeasonUpsert): Promise<AdminSeason>;
  deleteSeason(seasonId: string): Promise<{ deleted: boolean }>;
  createEpisode(
    seasonId: string,
    body: EpisodeUpsert & { number: number; name: string },
  ): Promise<AdminEpisode>;
  updateEpisode(episodeId: string, body: EpisodeUpsert): Promise<AdminEpisode>;
  deleteEpisode(episodeId: string): Promise<{ deleted: boolean }>;

  // uploads
  presignUpload(kind: PresignKind, contentType: string): Promise<PresignResponse>;
  uploadStat(key: string): Promise<UploadStatResponse>;

  // users
  listUsers(q?: string, take?: number, skip?: number): Promise<AdminUsersResponse>;
  setUserRoles(id: string, roles: string[]): Promise<AdminUser>;
  setUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<AdminUser>;
  verifyUser(id: string): Promise<AdminUser>;

  // purchases + audit
  listPurchases(opts?: {
    q?: string;
    titleId?: string;
    status?: string;
    take?: number;
    skip?: number;
  }): Promise<AdminPurchasesResponse>;
  listAudit(take?: number, skip?: number): Promise<AdminAuditResponse>;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

/**
 * Production client. Token pair lives in memory and is persisted (encrypted)
 * through the preload bridge. Refresh semantics mirror apps/web/src/lib/api.ts:
 * one transparent retry per request after a successful POST /v1/auth/refresh.
 */
export class HttpApiClient implements ApiClient {
  private tokens: TokenPair | null = null;
  private hydrated = false;

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    const raw = await studio.loadTokens();
    if (raw) {
      try {
        this.tokens = JSON.parse(raw) as TokenPair;
      } catch {
        this.tokens = null;
      }
    }
  }

  private async persist(): Promise<void> {
    if (this.tokens) await studio.saveTokens(JSON.stringify(this.tokens));
    else await studio.clearTokens();
  }

  async hasSession(): Promise<boolean> {
    await this.hydrate();
    return this.tokens !== null;
  }

  private async setTokens(pair: TokenPair | null): Promise<void> {
    this.tokens = pair;
    await this.persist();
  }

  private async request<T>(
    path: string,
    opts: { method?: string; body?: unknown; auth?: boolean; _retried?: boolean } = {},
  ): Promise<T> {
    await this.hydrate();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.auth && this.tokens) headers.Authorization = `Bearer ${this.tokens.accessToken}`;

    const res = await fetch(`${getApiBase()}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });

    if (res.status === 401 && opts.auth && !opts._retried && this.tokens) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request<T>(path, { ...opts, _retried: true });
    }

    if (!res.ok) {
      const problem = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new ApiError(
        res.status,
        typeof problem.title === 'string' ? problem.title : 'Error',
        typeof problem.detail === 'string'
          ? problem.detail
          : typeof problem.message === 'string'
            ? problem.message
            : `Request failed (${res.status})`,
      );
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async tryRefresh(): Promise<boolean> {
    const refreshToken = this.tokens?.refreshToken;
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${getApiBase()}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await this.setTokens(null);
        return false;
      }
      await this.setTokens((await res.json()) as TokenPair);
      return true;
    } catch {
      return false;
    }
  }

  // ── auth ──────────────────────────────────────────────────────────────────
  async exchangeDesktopCode(code: string, verifier: string): Promise<TokenPair> {
    const pair = await this.request<TokenPair>('/v1/auth/desktop/exchange', {
      method: 'POST',
      body: { code, verifier },
    });
    await this.setTokens(pair);
    return pair;
  }

  me(): Promise<Me> {
    return this.request<Me>('/v1/auth/me', { auth: true });
  }

  async logout(): Promise<void> {
    const refreshToken = this.tokens?.refreshToken;
    if (refreshToken) {
      await this.request('/v1/auth/logout', {
        method: 'POST',
        body: { refreshToken },
        auth: true,
      }).catch(() => undefined);
    }
    await this.setTokens(null);
  }

  // ── dashboard ─────────────────────────────────────────────────────────────
  stats(): Promise<AdminStats> {
    return this.request<AdminStats>('/v1/admin/stats', { auth: true });
  }

  // ── movies ────────────────────────────────────────────────────────────────
  listMovies(): Promise<AdminTitle[]> {
    return this.request<AdminTitle[]>('/v1/admin/movies', { auth: true });
  }

  getMovie(id: string): Promise<AdminTitle> {
    return this.request<AdminTitle>(`/v1/admin/movies/${id}`, { auth: true });
  }

  createMovie(body: TitleUpsert): Promise<AdminTitle> {
    return this.request<AdminTitle>('/v1/admin/movies', { method: 'POST', body, auth: true });
  }

  updateMovie(id: string, body: TitleUpsert): Promise<AdminTitle> {
    return this.request<AdminTitle>(`/v1/admin/movies/${id}`, {
      method: 'PATCH',
      body,
      auth: true,
    });
  }

  deleteMovie(id: string): Promise<{ deleted: boolean; id: string; soldTickets: number }> {
    return this.request(`/v1/admin/movies/${id}`, { method: 'DELETE', auth: true });
  }

  setFeatured(id: string, featured: boolean): Promise<AdminTitle> {
    return this.request<AdminTitle>(`/v1/admin/movies/${id}/featured`, {
      method: 'PUT',
      body: { featured },
      auth: true,
    });
  }

  setPremiere(id: string, isPremiere: boolean, premiereStartAt?: string): Promise<AdminTitle> {
    return this.request<AdminTitle>(`/v1/admin/movies/${id}/premiere`, {
      method: 'PUT',
      body: { isPremiere, premiereStartAt },
      auth: true,
    });
  }

  // ── series ────────────────────────────────────────────────────────────────
  listSeries(opts?: {
    query?: string;
    take?: number;
    skip?: number;
  }): Promise<AdminSeriesListResponse> {
    return this.request<AdminSeriesListResponse>(
      `/v1/admin/series${qs({ query: opts?.query, take: opts?.take, skip: opts?.skip })}`,
      { auth: true },
    );
  }

  createSeries(body: TitleUpsert): Promise<AdminTitle> {
    return this.request<AdminTitle>('/v1/admin/series', { method: 'POST', body, auth: true });
  }

  getSeries(id: string): Promise<AdminSeriesDetail> {
    return this.request<AdminSeriesDetail>(`/v1/admin/series/${id}`, { auth: true });
  }

  updateSeries(id: string, body: TitleUpsert): Promise<AdminSeriesDetail> {
    return this.request<AdminSeriesDetail>(`/v1/admin/series/${id}`, {
      method: 'PATCH',
      body,
      auth: true,
    });
  }

  deleteSeries(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.request(`/v1/admin/series/${id}`, { method: 'DELETE', auth: true });
  }

  createSeason(seriesId: string, body: SeasonUpsert & { number: number }): Promise<AdminSeason> {
    return this.request<AdminSeason>(`/v1/admin/series/${seriesId}/seasons`, {
      method: 'POST',
      body,
      auth: true,
    });
  }

  updateSeason(seasonId: string, body: SeasonUpsert): Promise<AdminSeason> {
    return this.request<AdminSeason>(`/v1/admin/seasons/${seasonId}`, {
      method: 'PATCH',
      body,
      auth: true,
    });
  }

  deleteSeason(seasonId: string): Promise<{ deleted: boolean }> {
    return this.request(`/v1/admin/seasons/${seasonId}`, { method: 'DELETE', auth: true });
  }

  createEpisode(
    seasonId: string,
    body: EpisodeUpsert & { number: number; name: string },
  ): Promise<AdminEpisode> {
    return this.request<AdminEpisode>(`/v1/admin/seasons/${seasonId}/episodes`, {
      method: 'POST',
      body,
      auth: true,
    });
  }

  updateEpisode(episodeId: string, body: EpisodeUpsert): Promise<AdminEpisode> {
    return this.request<AdminEpisode>(`/v1/admin/episodes/${episodeId}`, {
      method: 'PATCH',
      body,
      auth: true,
    });
  }

  deleteEpisode(episodeId: string): Promise<{ deleted: boolean }> {
    return this.request(`/v1/admin/episodes/${episodeId}`, { method: 'DELETE', auth: true });
  }

  // ── uploads ───────────────────────────────────────────────────────────────
  presignUpload(kind: PresignKind, contentType: string): Promise<PresignResponse> {
    return this.request<PresignResponse>('/v1/admin/uploads/presign', {
      method: 'POST',
      body: { kind, contentType },
      auth: true,
    });
  }

  uploadStat(key: string): Promise<UploadStatResponse> {
    return this.request<UploadStatResponse>(
      `/v1/admin/uploads/stat?key=${encodeURIComponent(key)}`,
      { auth: true },
    );
  }

  // ── users ─────────────────────────────────────────────────────────────────
  listUsers(q?: string, take?: number, skip?: number): Promise<AdminUsersResponse> {
    return this.request<AdminUsersResponse>(`/v1/admin/users${qs({ q, take, skip })}`, {
      auth: true,
    });
  }

  setUserRoles(id: string, roles: string[]): Promise<AdminUser> {
    return this.request<AdminUser>(`/v1/admin/users/${id}/roles`, {
      method: 'PUT',
      body: { roles },
      auth: true,
    });
  }

  setUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<AdminUser> {
    return this.request<AdminUser>(`/v1/admin/users/${id}/status`, {
      method: 'PUT',
      body: { status },
      auth: true,
    });
  }

  verifyUser(id: string): Promise<AdminUser> {
    return this.request<AdminUser>(`/v1/admin/users/${id}/verify`, { method: 'POST', auth: true });
  }

  // ── purchases + audit ─────────────────────────────────────────────────────
  listPurchases(opts?: {
    q?: string;
    titleId?: string;
    status?: string;
    take?: number;
    skip?: number;
  }): Promise<AdminPurchasesResponse> {
    return this.request<AdminPurchasesResponse>(
      `/v1/admin/purchases${qs({
        q: opts?.q,
        titleId: opts?.titleId,
        status: opts?.status,
        take: opts?.take,
        skip: opts?.skip,
      })}`,
      { auth: true },
    );
  }

  listAudit(take?: number, skip?: number): Promise<AdminAuditResponse> {
    return this.request<AdminAuditResponse>(`/v1/admin/audit${qs({ take, skip })}`, {
      auth: true,
    });
  }
}
