import { Injectable } from '@nestjs/common';
import type { CatalogueRepository } from '../domain/catalogue.repository';
import type { Title } from '../domain/title.entity';
import { SAMPLE_CATALOGUE } from '../data/sample-catalogue';

/**
 * In-memory catalogue backed by the bundled seed. Enables a fully offline dev /
 * test loop (CATALOGUE_DRIVER=local) with no DynamoDB dependency.
 */
@Injectable()
export class LocalCatalogueRepository implements CatalogueRepository {
  private readonly titles: Title[] = SAMPLE_CATALOGUE;

  async listByCategory(category: string, limit = 20): Promise<Title[]> {
    return this.titles
      .filter((t) => t.categories.includes(category))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit);
  }

  async findById(id: string): Promise<Title | null> {
    return this.titles.find((t) => t.id === id) ?? null;
  }

  async search(query: string, limit = 30): Promise<Title[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return this.titles
      .filter((t) =>
        [t.title, t.overview, ...t.cast, ...t.genres]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit);
  }

  async featured(): Promise<Title | null> {
    return this.titles.find((t) => t.featured) ?? this.titles[0] ?? null;
  }
}
