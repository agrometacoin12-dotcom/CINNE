import type { Title } from './title.entity';

/**
 * Persistence-agnostic catalogue repository (Repository pattern). The service
 * depends on this interface; concrete implementations target a local seed
 * (offline dev) or DynamoDB (AWS).
 */
export interface CatalogueRepository {
  /** All titles in a given curated category, ordered by popularity desc. */
  listByCategory(category: string, limit?: number): Promise<Title[]>;
  findById(id: string): Promise<Title | null>;
  /** Naive substring search over title/overview/cast (OpenSearch at scale). */
  search(query: string, limit?: number): Promise<Title[]>;
  /** The single featured hero title, if any. */
  featured(): Promise<Title | null>;

  // ── Admin / write surface ──────────────────────────────────────────────────
  /** Every title (incl. drafts) for the admin console, newest popularity first. */
  listAll(): Promise<Title[]>;
  /** All published premieres, soonest showtime first. */
  listPremieres(): Promise<Title[]>;
  /** Upsert a full title record. */
  save(title: Title): Promise<Title>;
  /** Patch selected fields of an existing title. */
  update(id: string, patch: Partial<Title>): Promise<Title>;
  /** Set the single featured hero title (clears the flag on the previous one). */
  setFeatured(id: string, featured: boolean): Promise<void>;
}

export const CATALOGUE_REPOSITORY = Symbol('CATALOGUE_REPOSITORY');
