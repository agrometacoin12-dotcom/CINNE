import { z } from 'zod';

/**
 * Catalogue & watchlist contracts (Phase 2) — the single source of truth shared
 * by backend, web, and iOS (mirrored to Swift).
 */

export const titleType = z.enum(['movie', 'series']);
export type TitleType = z.infer<typeof titleType>;

export const maturityRating = z.enum(['G', 'PG', 'PG-13', 'R', 'NC-17', 'TV-MA', 'TV-14']);
export type MaturityRating = z.infer<typeof maturityRating>;

/** Compact representation used in browse rows / search results / watchlist. */
export const titleSummarySchema = z.object({
  id: z.string().uuid(),
  type: titleType,
  title: z.string(),
  year: z.number().int(),
  rating: z.number(),
  genres: z.array(z.string()),
  posterUrl: z.string().nullable(),
});
export type TitleSummary = z.infer<typeof titleSummarySchema>;

// ── Series: seasons & episodes (viewer) ──────────────────────────────────────

/** Viewer-facing episode. Raw video keys are never exposed — only `hasVideo`. */
export const episodeSummarySchema = z.object({
  id: z.string().uuid(),
  number: z.number().int(),
  name: z.string(),
  overview: z.string().nullable(),
  runtimeMinutes: z.number().int().nullable(),
  hasVideo: z.boolean(),
  /** Watch-once state; present only when the request was authenticated. */
  consumed: z.boolean().optional(),
});
export type EpisodeSummary = z.infer<typeof episodeSummarySchema>;

export const seasonSummarySchema = z.object({
  id: z.string().uuid(),
  number: z.number().int(),
  name: z.string().nullable(),
  episodes: z.array(episodeSummarySchema),
});
export type SeasonSummary = z.infer<typeof seasonSummarySchema>;

/** Full title detail. */
export const titleSchema = titleSummarySchema.extend({
  tagline: z.string().nullable(),
  overview: z.string(),
  runtimeMinutes: z.number().int().nullable(),
  seasons: z.number().int().nullable(),
  maturityRating: maturityRating.nullable(),
  heroUrl: z.string().nullable(),
  cast: z.array(z.string()),
  director: z.string().nullable(),
  categories: z.array(z.string()),
  // Mobile-cinema commerce / premiere
  priceMinor: z.number().int(),
  currency: z.string(),
  durationSeconds: z.number().int().nullable(),
  isPremiere: z.boolean(),
  premiereStartAt: z.string().nullable(),
  premiereLive: z.boolean(),
  hasVideo: z.boolean(),
  /** Present only on PUBLISHED series: the seasons/episodes tree. */
  seasonsList: z.array(seasonSummarySchema).optional(),
});
export type Title = z.infer<typeof titleSchema>;

/** Admin-only view of a title (drafts + raw keys). */
export const adminTitleSchema = titleSchema.extend({
  status: z.enum(['draft', 'published']),
  featured: z.boolean(),
  videoKey: z.string().nullable(),
  posterKey: z.string().nullable(),
  heroKey: z.string().nullable(),
  popularity: z.number().int(),
});
export type AdminTitle = z.infer<typeof adminTitleSchema>;

// ── Admin: series ────────────────────────────────────────────────────────────

/** Admin episode view — includes the raw object keys. */
export const adminEpisodeSchema = z.object({
  id: z.string().uuid(),
  number: z.number().int(),
  name: z.string(),
  overview: z.string().nullable(),
  runtimeMinutes: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  videoKey: z.string().nullable(),
  stillKey: z.string().nullable(),
  stillUrl: z.string().nullable(),
  hasVideo: z.boolean(),
});
export type AdminEpisode = z.infer<typeof adminEpisodeSchema>;

export const adminSeasonSchema = z.object({
  id: z.string().uuid(),
  number: z.number().int(),
  name: z.string().nullable(),
  overview: z.string().nullable(),
  episodes: z.array(adminEpisodeSchema),
});
export type AdminSeason = z.infer<typeof adminSeasonSchema>;

/** One row in the admin series list. */
export const adminSeriesSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  year: z.number().int(),
  status: z.enum(['draft', 'published']),
  featured: z.boolean(),
  priceMinor: z.number().int(),
  currency: z.string(),
  posterUrl: z.string().nullable(),
  seasonCount: z.number().int(),
  episodeCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminSeriesSummary = z.infer<typeof adminSeriesSummarySchema>;

export const adminSeriesListResponseSchema = z.object({
  total: z.number().int(),
  items: z.array(adminSeriesSummarySchema),
});
export type AdminSeriesListResponse = z.infer<typeof adminSeriesListResponseSchema>;

/** Full admin tree: title fields + seasons (replaces the derived count). */
export const adminSeriesDetailSchema = adminTitleSchema.omit({ seasons: true }).extend({
  seasons: z.array(adminSeasonSchema),
});
export type AdminSeriesDetail = z.infer<typeof adminSeriesDetailSchema>;

// ── Admin: users & stats ─────────────────────────────────────────────────────
export const adminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  roles: z.array(z.string()),
  status: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  purchases: z.number().int(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUsersResponseSchema = z.object({
  total: z.number().int(),
  users: z.array(adminUserSchema),
});
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;

export const adminStatsSchema = z.object({
  users: z.number().int(),
  titles: z.number().int(),
  published: z.number().int(),
  purchases: z.number().int(),
  activeEntitlements: z.number().int(),
  revenue: z.array(z.object({ currency: z.string(), totalMinor: z.number().int() })),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;

// ── Admin: sales ledger ──────────────────────────────────────────────────────
export const adminPurchaseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userEmail: z.string(),
  userDisplayName: z.string().nullable(),
  titleId: z.string(),
  titleName: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  provider: z.string(),
  status: z.string(),
  isGift: z.boolean(),
  entitlementStatus: z.string().nullable(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
});
export type AdminPurchase = z.infer<typeof adminPurchaseSchema>;

export const adminPurchasesResponseSchema = z.object({
  total: z.number().int(),
  items: z.array(adminPurchaseSchema),
});
export type AdminPurchasesResponse = z.infer<typeof adminPurchasesResponseSchema>;

// ── Admin: audit feed ────────────────────────────────────────────────────────
export const adminAuditEntrySchema = z.object({
  id: z.string(),
  actorId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  entity: z.string().nullable(),
  entityId: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;

export const adminAuditResponseSchema = z.object({
  total: z.number().int(),
  items: z.array(adminAuditEntrySchema),
});
export type AdminAuditResponse = z.infer<typeof adminAuditResponseSchema>;

// ── Playback: progress & continue-watching ───────────────────────────────────
export const playbackProgressItemSchema = z.object({
  titleId: z.string(),
  /** Present when the heartbeat targeted one episode of a series. */
  episodeId: z.string().optional(),
  positionSeconds: z.number().int(),
  durationSeconds: z.number().int(),
  progress: z.number(),
  /** Episode watch-once state; present on episode heartbeats only. */
  consumed: z.boolean().optional(),
  updatedAt: z.string(),
});
export type PlaybackProgressItem = z.infer<typeof playbackProgressItemSchema>;

export const continueWatchingItemSchema = z.object({
  titleId: z.string(),
  title: z.string(),
  posterUrl: z.string().nullable(),
  heroUrl: z.string().nullable(),
  positionSeconds: z.number().int(),
  durationSeconds: z.number().int(),
  progress: z.number(),
  updatedAt: z.string(),
});
export type ContinueWatchingItem = z.infer<typeof continueWatchingItemSchema>;

// ── Commerce ─────────────────────────────────────────────────────────────────
export const purchaseResultSchema = z.object({
  status: z.enum(['paid', 'pending', 'failed', 'already_entitled']),
  titleId: z.string().uuid(),
  reference: z.string().optional(),
  amountMinor: z.number().optional(),
  currency: z.string().optional(),
  authorizationUrl: z.string().nullable().optional(),
  isGift: z.boolean().optional(),
});
export type PurchaseResult = z.infer<typeof purchaseResultSchema>;

export const entitlementSchema = z.object({
  titleId: z.string().uuid(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'CONSUMED', 'REVOKED']),
  startedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  title: titleSummarySchema.nullable(),
});
export type Entitlement = z.infer<typeof entitlementSchema>;

// ── Playback ─────────────────────────────────────────────────────────────────
export const playbackSessionSchema = z.object({
  titleId: z.string().uuid(),
  /** Present when playback targeted one episode of a series. */
  episodeId: z.string().uuid().optional(),
  title: z.string(),
  episodeName: z.string().optional(),
  url: z.string(),
  durationSeconds: z.number().int(),
  watermark: z.string(),
  sessionId: z.string(),
  expiresAt: z.string().nullable(),
});
export type PlaybackSession = z.infer<typeof playbackSessionSchema>;

// ── Premiere live chat ───────────────────────────────────────────────────────
export const chatMessageSchema = z.object({
  id: z.string(),
  author: z.string(),
  body: z.string(),
  userId: z.string(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const premiereRoomSchema = z.object({
  titleId: z.string().uuid(),
  title: z.string(),
  live: z.boolean(),
  premiereStartAt: z.string().nullable(),
  canChat: z.boolean(),
  entitled: z.boolean(),
});
export type PremiereRoom = z.infer<typeof premiereRoomSchema>;

/** A horizontally scrolling browse row (Netflix-style). */
export const browseRowSchema = z.object({
  slug: z.string(),
  title: z.string(),
  items: z.array(titleSummarySchema),
});
export type BrowseRow = z.infer<typeof browseRowSchema>;

export const browseResponseSchema = z.object({
  hero: titleSchema.nullable(),
  rows: z.array(browseRowSchema),
});
export type BrowseResponse = z.infer<typeof browseResponseSchema>;

export const searchResponseSchema = z.object({
  query: z.string(),
  results: z.array(titleSummarySchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

// Watchlist
export const watchlistItemSchema = z.object({
  titleId: z.string().uuid(),
  addedAt: z.string(),
  title: titleSummarySchema.nullable(),
});
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;

export const addToWatchlistSchema = z.object({
  titleId: z.string().uuid(),
});
export type AddToWatchlistInput = z.infer<typeof addToWatchlistSchema>;
