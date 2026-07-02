/**
 * Catalogue domain entity. Frameworks/persistence are kept out of this file;
 * repositories map to/from this shape.
 */

export type TitleType = 'movie' | 'series';

export interface Title {
  id: string;
  type: TitleType;
  title: string;
  tagline: string | null;
  overview: string;
  year: number;
  genres: string[];
  runtimeMinutes: number | null;
  seasons: number | null;
  maturityRating: string | null;
  rating: number;
  /** S3 object keys; resolved to CDN URLs by the service. */
  posterKey: string | null;
  heroKey: string | null;
  cast: string[];
  director: string | null;
  /** Curated browse-row slugs this title belongs to (e.g. "trending"). */
  categories: string[];
  /** Higher = earlier in a row. */
  popularity: number;
  featured: boolean;

  // ── Mobile-cinema commerce & delivery ──────────────────────────────────────
  /** Publication state. Drafts are admin-only; only published titles are sold. */
  status: TitleStatus;
  /** Price to watch once, in the smallest currency unit (e.g. kobo). 0 = free. */
  priceMinor: number;
  currency: string;
  /** S3 object key for the playable master. Resolved to a (signed) URL on play. */
  videoKey: string | null;
  /** Playback length in seconds; defines the single-view window. Falls back to
   *  runtimeMinutes × 60 when absent. */
  durationSeconds: number | null;
  /** Premiere = a scheduled live event with live chat while it is on. */
  isPremiere: boolean;
  /** ISO timestamp the premiere goes live, if any. */
  premiereStartAt: string | null;
}

export type TitleStatus = 'draft' | 'published';

/** Sensible defaults applied to seed titles that predate the commerce fields. */
export function withCommerceDefaults(t: Partial<Title> & Omit<Title, keyof CommerceFields>): Title {
  return {
    status: 'published',
    priceMinor: 0,
    currency: 'NGN',
    videoKey: null,
    durationSeconds: t.runtimeMinutes ? t.runtimeMinutes * 60 : null,
    isPremiere: false,
    premiereStartAt: null,
    ...t,
  } as Title;
}

type CommerceFields = Pick<
  Title,
  | 'status'
  | 'priceMinor'
  | 'currency'
  | 'videoKey'
  | 'durationSeconds'
  | 'isPremiere'
  | 'premiereStartAt'
>;

/** Shape of a seed entry before commerce defaults are applied. */
export type SeedTitle = Omit<Title, keyof CommerceFields>;

/** Catalogue browse rows, in display order. */
export const BROWSE_ROWS: { slug: string; title: string }[] = [
  { slug: 'new-listings', title: 'New Listings' },
  { slug: 'trending', title: 'Trending now' },
  { slug: 'most-watched', title: 'Most watched' },
  { slug: 'coming-soon', title: 'Coming soon' },
  { slug: 'new-releases', title: 'New releases' },
  { slug: 'acclaimed', title: 'Critically acclaimed' },
  { slug: 'series', title: 'Binge-worthy series' },
];

/** Category slug automatically applied to every admin-created title so new
 *  uploads surface in the "New Listings" row without manual tagging. */
export const NEW_LISTINGS_CATEGORY = 'new-listings';
