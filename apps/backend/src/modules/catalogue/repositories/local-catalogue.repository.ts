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
  // Mutable copy so the admin console can create/edit titles in offline dev.
  private readonly titles: Title[] = SAMPLE_CATALOGUE.map((t) => ({ ...t }));

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

  async listAll(): Promise<Title[]> {
    return [...this.titles].sort((a, b) => b.popularity - a.popularity);
  }

  async listPremieres(): Promise<Title[]> {
    return this.titles
      .filter((t) => t.isPremiere && t.status === 'published')
      .sort(
        (a, b) =>
          new Date(a.premiereStartAt ?? 0).getTime() - new Date(b.premiereStartAt ?? 0).getTime(),
      );
  }

  async save(title: Title): Promise<Title> {
    const idx = this.titles.findIndex((t) => t.id === title.id);
    if (idx >= 0) this.titles[idx] = { ...title };
    else this.titles.push({ ...title });
    return title;
  }

  async update(id: string, patch: Partial<Title>): Promise<Title> {
    const existing = this.titles.find((t) => t.id === id);
    if (!existing) throw new Error(`Title ${id} not found`);
    const updated: Title = { ...existing, ...patch, id };
    const idx = this.titles.indexOf(existing);
    this.titles[idx] = updated;
    return updated;
  }

  async setFeatured(id: string, featured: boolean): Promise<void> {
    if (featured) this.titles.forEach((t) => (t.featured = false));
    const t = this.titles.find((x) => x.id === id);
    if (t) t.featured = featured;
  }
}
