/**
 * Wire types for the CinneTemple API, mirrored by hand from
 * packages/shared/src/*.contracts.ts (zod) plus the agreed series/desktop-auth
 * contract. Kept dependency-free so the desktop app builds standalone.
 */

// ── Auth ────────────────────────────────────────────────────────────────────
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface Me {
  id: string;
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  roles: string[];
  isAdmin: boolean;
  profile: { displayName: string; avatarUrl: string | null; locale: string } | null;
}

// ── Catalogue / titles ──────────────────────────────────────────────────────
export type TitleStatus = 'draft' | 'published';

export interface AdminTitle {
  id: string;
  type: 'movie' | 'series';
  title: string;
  year: number;
  rating: number;
  genres: string[];
  posterUrl: string | null;
  tagline: string | null;
  overview: string;
  runtimeMinutes: number | null;
  seasons: number | null;
  maturityRating: string | null;
  heroUrl: string | null;
  cast: string[];
  director: string | null;
  categories: string[];
  priceMinor: number;
  currency: string;
  durationSeconds: number | null;
  isPremiere: boolean;
  premiereStartAt: string | null;
  premiereLive: boolean;
  hasVideo: boolean;
  status: TitleStatus;
  featured: boolean;
  videoKey: string | null;
  posterKey: string | null;
  heroKey: string | null;
  popularity: number;
}

/** Fields accepted by POST/PATCH /v1/admin/movies and /v1/admin/series. */
export interface TitleUpsert {
  title?: string;
  type?: 'movie' | 'series';
  tagline?: string | null;
  overview?: string;
  year?: number;
  genres?: string[];
  cast?: string[];
  director?: string | null;
  categories?: string[];
  maturityRating?: string | null;
  runtimeMinutes?: number;
  durationSeconds?: number;
  priceMinor?: number;
  currency?: string;
  posterKey?: string | null;
  heroKey?: string | null;
  videoKey?: string | null;
  featured?: boolean;
  status?: TitleStatus;
}

// ── Series (new contract) ───────────────────────────────────────────────────
export interface AdminSeriesSummary {
  id: string;
  title: string;
  year: number;
  status: TitleStatus;
  priceMinor: number;
  currency: string;
  posterUrl: string | null;
  genres: string[];
  featured: boolean;
  seasonCount: number;
  episodeCount: number;
}

export interface AdminSeriesListResponse {
  items: AdminSeriesSummary[];
  total: number;
}

export interface AdminEpisode {
  id: string;
  number: number;
  name: string;
  overview: string | null;
  runtimeMinutes: number | null;
  durationSeconds: number | null;
  videoKey: string | null;
  stillKey: string | null;
  hasVideo: boolean;
}

export interface AdminSeason {
  id: string;
  number: number;
  name: string | null;
  overview: string | null;
  episodes: AdminEpisode[];
}

/** Full tree from GET /v1/admin/series/:id. */
export interface AdminSeriesDetail extends AdminTitle {
  seasonsList: AdminSeason[];
}

export interface SeasonUpsert {
  number?: number;
  name?: string | null;
  overview?: string | null;
}

export interface EpisodeUpsert {
  number?: number;
  name?: string;
  overview?: string | null;
  runtimeMinutes?: number | null;
  durationSeconds?: number | null;
  videoKey?: string | null;
  stillKey?: string | null;
}

// ── Admin: users ────────────────────────────────────────────────────────────
export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];
  status: string;
  emailVerified: boolean;
  createdAt: string;
  purchases: number;
}

export interface AdminUsersResponse {
  total: number;
  users: AdminUser[];
}

// ── Admin: stats ────────────────────────────────────────────────────────────
export interface AdminStats {
  users: number;
  titles: number;
  published: number;
  purchases: number;
  activeEntitlements: number;
  revenue: { currency: string; totalMinor: number }[];
}

// ── Admin: purchases ────────────────────────────────────────────────────────
export interface AdminPurchase {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string | null;
  titleId: string;
  titleName: string;
  amountMinor: number;
  currency: string;
  provider: string;
  status: string;
  isGift: boolean;
  entitlementStatus: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface AdminPurchasesResponse {
  total: number;
  items: AdminPurchase[];
}

// ── Admin: audit ────────────────────────────────────────────────────────────
export interface AdminAuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface AdminAuditResponse {
  total: number;
  items: AdminAuditEntry[];
}

// ── Uploads ─────────────────────────────────────────────────────────────────
export type PresignKind = 'video' | 'poster' | 'hero' | 'still';

export interface PresignResponse {
  enabled: boolean;
  key: string;
  uploadUrl: string | null;
  headers: Record<string, string>;
}

export interface UploadStatResponse {
  exists: boolean;
  size: number;
}
