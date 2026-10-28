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
  trailerKey: string | null;
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
  trailerKey?: string | null;
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
export type PresignKind = 'video' | 'poster' | 'hero' | 'still' | 'trailer';

export interface PresignResponse {
  enabled: boolean;
  key: string;
  uploadUrl: string | null;
  headers: Record<string, string>;
  multipart?: {
    uploadId: string;
    partSize: number;
    parts: Array<{ partNumber: number; uploadUrl: string }>;
  };
}

export interface CompletedUploadPart {
  partNumber: number;
  etag: string;
}

export interface UploadStatResponse {
  exists: boolean;
  size: number;
}

export interface AdminCoinTopup {
  id: string; userEmail: string; userDisplayName: string | null;
  reference: string; coins: number; amountMinor: number; currency: string;
  provider: string; status: string; createdAt: string; paidAt: string | null;
}
export interface AdminCoinTopupsResponse { total: number; items: AdminCoinTopup[]; }
export interface CoinTopupQuery { q?: string; status?: string; take?: number; skip?: number; }

// ── Content classification & rule-based homepage ────────────────────────────
// Mirrors docs/content-classification.md ("Admin API").

export type ContentFormat =
  | 'FEATURE_FILM'
  | 'SHORT_FILM'
  | 'TV_SERIES'
  | 'LIMITED_SERIES'
  | 'MINISERIES'
  | 'DOCUMENTARY_FILM'
  | 'DOCUMENTARY_SERIES'
  | 'ANIMATION_FILM'
  | 'ANIMATED_SERIES'
  | 'STANDUP_COMEDY'
  | 'LIVE_PERFORMANCE'
  | 'SPECIAL'
  | 'ANTHOLOGY'
  | 'REALITY_SERIES'
  | 'MUSIC_FILM';

export type Audience = 'KIDS' | 'TEENS' | 'FAMILY' | 'ADULTS';

export type AccessType =
  | 'FREE'
  | 'SUBSCRIPTION'
  | 'PAY_PER_VIEW'
  | 'RENTAL'
  | 'PURCHASE'
  | 'PROMOTIONAL';

export type TagKind = 'MOOD' | 'THEME' | 'SETTING' | 'CHARACTER' | 'STORY';
export type CollectionKind = 'EDITORIAL' | 'SYSTEM';

export type HomeSectionKind =
  | 'RULE'
  | 'CONTINUE_WATCHING'
  | 'WATCHLIST'
  | 'RECOMMENDED'
  | 'BECAUSE_YOU_WATCHED';

export type HomeSort =
  | 'POPULARITY'
  | 'PUBLISHED_DESC'
  | 'RELEASE_DESC'
  | 'RELEASE_ASC'
  | 'RATING_DESC'
  | 'PLAYS_1D'
  | 'PLAYS_7D'
  | 'PLAYS_ALL'
  | 'LATEST_EPISODE'
  | 'EXPIRING_SOON'
  | 'MANUAL';

export interface TaxonomyGenre {
  slug: string;
  name: string;
  subgenres: { slug: string; name: string }[];
}
export interface TaxonomyTag {
  slug: string;
  name: string;
  kind: TagKind;
}
export interface TaxonomyIndustry {
  slug: string;
  name: string;
}
export interface TaxonomyCollection {
  slug: string;
  name: string;
  kind: CollectionKind;
  description?: string | null;
}

/** GET /v1/admin/taxonomy */
export interface Taxonomy {
  genres: TaxonomyGenre[];
  tags: TaxonomyTag[];
  industries: TaxonomyIndustry[];
  collections: TaxonomyCollection[];
  formats: { value: ContentFormat; label: string }[];
  audiences: { value: Audience; label: string }[];
  accessTypes: { value: AccessType; label: string }[];
  languages: { code: string; name: string }[];
  decades: string[];
}

/** PUT /v1/admin/titles/:id/classification — undefined = unchanged, null = clear. */
export interface ClassificationInput {
  contentFormat?: ContentFormat | null;
  genres?: string[];
  tags?: string[];
  collections?: string[];
  /** MANUAL industries only; AUTO ones are recomputed by the server. */
  industries?: string[];
  audience?: Audience | null;
  ageRating?: string | null;
  ratingJurisdiction?: string | null;
  /** 'YYYY-MM-DD' */
  releaseDate?: string | null;
  accessType?: AccessType | null;
  productionCountries?: string[];
  originalLanguages?: string[];
  audioLanguages?: string[];
  /** ISO timestamps */
  availableFrom?: string | null;
  availableUntil?: string | null;
  seriesComplete?: boolean;
}

export interface PlacementEntry {
  slug: string;
  title: string;
  eligible: boolean;
  reason?: string;
}

export interface ClassificationIndustry {
  slug: string;
  name: string;
  source: 'manual' | 'auto';
}

export interface ClassificationDto {
  titleId: string;
  type: 'movie' | 'series';
  contentFormat: ContentFormat | null;
  effectiveFormat: ContentFormat;
  genres: string[];
  tags: string[];
  collections: string[];
  industries: ClassificationIndustry[];
  audience: Audience | null;
  ageRating: string | null;
  ratingJurisdiction: string | null;
  releaseDate: string | null;
  accessType: AccessType | null;
  effectiveAccess: AccessType;
  productionCountries: string[];
  originalLanguages: string[];
  audioLanguages: string[];
  availableFrom: string | null;
  availableUntil: string | null;
  seriesComplete: boolean;
  /** Every enabled RULE section whose rules match this title. */
  placement: PlacementEntry[];
}

/** HomepageSection.rules (JSON). Keys combine with AND; list values with OR. */
export interface SectionRules {
  types?: ('movie' | 'series')[];
  formats?: ContentFormat[];
  genresAny?: string[];
  tagsAny?: string[];
  collectionsAny?: string[];
  industriesAny?: string[];
  audiencesAny?: Audience[];
  accessAny?: AccessType[];
  minRuntimeMinutes?: number;
  maxRuntimeMinutes?: number;
  releasedWithinDays?: number;
  publishedWithinDays?: number;
  releaseYearMin?: number;
  releaseYearMax?: number;
  premiere?: boolean;
  upcoming?: boolean;
  expiringWithinDays?: number;
  seriesComplete?: boolean;
  hasEpisodeWithinDays?: number;
  minPlays1d?: number;
  minPlays7d?: number;
  minPlaysAll?: number;
  anyOf?: SectionRules[];
}

export interface HomeSectionDto {
  id: string;
  slug: string;
  title: string;
  kind: HomeSectionKind;
  rules: SectionRules;
  sort: HomeSort;
  limit: number;
  minItems: number;
  enabled: boolean;
  position: number;
  pinnedTitleIds: string[];
  excludedTitleIds: string[];
  /** null for personal kinds. */
  eligibleCount: number | null;
  /** Would show on browse right now. */
  live: boolean;
}

/** PATCH /v1/admin/home-sections/:id */
export interface HomeSectionPatch {
  title?: string;
  enabled?: boolean;
  sort?: HomeSort;
  limit?: number;
  minItems?: number;
  rules?: SectionRules;
  pinnedTitleIds?: string[];
  excludedTitleIds?: string[];
}

/** Public catalogue card (packages/shared titleSummarySchema). */
export interface TitleSummary {
  id: string;
  type: 'movie' | 'series';
  title: string;
  year: number;
  rating: number;
  genres: string[];
  posterUrl: string | null;
}

/** GET /v1/admin/home-preview */
export interface HomePreview {
  rows: { slug: string; title: string; count: number; items: TitleSummary[] }[];
  hidden: { slug: string; title: string; reason: string }[];
}

export interface CollectionCreate {
  slug: string;
  name: string;
  description?: string;
}

export interface CollectionUpdate {
  name?: string;
  description?: string;
}
