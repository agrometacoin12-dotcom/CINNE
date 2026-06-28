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
});
export type Title = z.infer<typeof titleSchema>;

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
