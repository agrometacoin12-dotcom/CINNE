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
}

/** Catalogue browse rows, in display order. */
export const BROWSE_ROWS: { slug: string; title: string }[] = [
  { slug: 'trending', title: 'Trending now' },
  { slug: 'most-watched', title: 'Most watched' },
  { slug: 'coming-soon', title: 'Coming soon' },
  { slug: 'new-releases', title: 'New releases' },
  { slug: 'acclaimed', title: 'Critically acclaimed' },
  { slug: 'series', title: 'Binge-worthy series' },
];
