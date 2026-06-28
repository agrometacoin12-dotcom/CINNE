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
}

export const CATALOGUE_REPOSITORY = Symbol('CATALOGUE_REPOSITORY');
