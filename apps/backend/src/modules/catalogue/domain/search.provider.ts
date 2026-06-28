import type { Title } from './title.entity';

/**
 * Relevance search abstraction. `local` delegates to the catalogue repository's
 * substring scan (offline dev); `opensearch` runs a real relevance query.
 */
export interface SearchProvider {
  search(query: string, limit?: number): Promise<Title[]>;
}

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');
