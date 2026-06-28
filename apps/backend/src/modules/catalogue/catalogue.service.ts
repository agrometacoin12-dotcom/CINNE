import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CATALOGUE_REPOSITORY, type CatalogueRepository } from './domain/catalogue.repository';
import { SEARCH_PROVIDER, type SearchProvider } from './domain/search.provider';
import { BROWSE_ROWS, type Title } from './domain/title.entity';

/** Shapes matching @cinnetemple/shared contracts (kept in sync). */
export interface TitleSummaryDto {
  id: string;
  type: string;
  title: string;
  year: number;
  rating: number;
  genres: string[];
  posterUrl: string | null;
}

export interface TitleDto extends TitleSummaryDto {
  tagline: string | null;
  overview: string;
  runtimeMinutes: number | null;
  seasons: number | null;
  maturityRating: string | null;
  heroUrl: string | null;
  cast: string[];
  director: string | null;
  categories: string[];
}

@Injectable()
export class CatalogueService {
  private readonly mediaBaseUrl: string | null;

  constructor(
    @Inject(CATALOGUE_REPOSITORY) private readonly repo: CatalogueRepository,
    @Inject(SEARCH_PROVIDER) private readonly searchProvider: SearchProvider,
    config: ConfigService,
  ) {
    this.mediaBaseUrl = config.get<string>('mediaBaseUrl') || null;
  }

  async browse() {
    const [hero, ...rowResults] = await Promise.all([
      this.repo.featured(),
      ...BROWSE_ROWS.map((r) => this.repo.listByCategory(r.slug)),
    ]);

    const rows = BROWSE_ROWS.map((row, i) => ({
      slug: row.slug,
      title: row.title,
      items: (rowResults[i] ?? []).map((t) => this.toSummary(t)),
    })).filter((row) => row.items.length > 0);

    return { hero: hero ? this.toDetail(hero) : null, rows };
  }

  async getTitle(id: string) {
    const title = await this.repo.findById(id);
    if (!title) throw new NotFoundException('Title not found');
    return this.toDetail(title);
  }

  async search(query: string) {
    const results = await this.searchProvider.search(query);
    return { query, results: results.map((t) => this.toSummary(t)) };
  }

  // MARK: - Mapping

  private mediaUrl(key: string | null): string | null {
    if (!key) return null;
    if (!this.mediaBaseUrl) return null;
    return `${this.mediaBaseUrl}/${key}`;
  }

  private toSummary(t: Title): TitleSummaryDto {
    return {
      id: t.id,
      type: t.type,
      title: t.title,
      year: t.year,
      rating: t.rating,
      genres: t.genres,
      posterUrl: this.mediaUrl(t.posterKey),
    };
  }

  private toDetail(t: Title): TitleDto {
    return {
      ...this.toSummary(t),
      tagline: t.tagline,
      overview: t.overview,
      runtimeMinutes: t.runtimeMinutes,
      seasons: t.seasons,
      maturityRating: t.maturityRating,
      heroUrl: this.mediaUrl(t.heroKey),
      cast: t.cast,
      director: t.director,
      categories: t.categories,
    };
  }

  /** Used by the watchlist module to enrich saved items. */
  async summaryFor(id: string): Promise<TitleSummaryDto | null> {
    const t = await this.repo.findById(id);
    return t ? this.toSummary(t) : null;
  }
}
