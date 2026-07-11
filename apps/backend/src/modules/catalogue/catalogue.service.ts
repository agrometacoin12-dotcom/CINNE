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
  // Mobile-cinema commerce / premiere surface (safe to expose to clients).
  priceMinor: number;
  currency: string;
  durationSeconds: number | null;
  isPremiere: boolean;
  premiereStartAt: string | null;
  premiereLive: boolean;
  hasVideo: boolean;
}

/** Admin-only view: includes draft status and the raw object keys. */
export interface AdminTitleDto extends TitleDto {
  status: 'draft' | 'published';
  featured: boolean;
  videoKey: string | null;
  posterKey: string | null;
  heroKey: string | null;
  popularity: number;
}

@Injectable()
export class CatalogueService {
  private readonly mediaBaseUrl: string | null;
  private readonly apiPublicUrl: string;

  constructor(
    @Inject(CATALOGUE_REPOSITORY) private readonly repo: CatalogueRepository,
    @Inject(SEARCH_PROVIDER) private readonly searchProvider: SearchProvider,
    config: ConfigService,
  ) {
    this.mediaBaseUrl = config.get<string>('mediaBaseUrl') || null;
    this.apiPublicUrl = (config.get<string>('apiPublicUrl') ?? 'http://localhost:4000').replace(
      /\/$/,
      '',
    );
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
    if (/^https?:\/\//.test(key)) return key; // already an absolute URL
    if (this.mediaBaseUrl) return `${this.mediaBaseUrl}/${key}`;
    // No CDN configured: the API serves locally stored media itself.
    return `${this.apiPublicUrl}/media/${key}`;
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

  static premiereIsLive(t: Title, now = new Date()): boolean {
    if (!t.isPremiere || !t.premiereStartAt) return false;
    const start = new Date(t.premiereStartAt).getTime();
    const durationMs = (t.durationSeconds ?? (t.runtimeMinutes ?? 0) * 60) * 1000;
    // Live from showtime until the film would have finished (+15 min buffer).
    return now.getTime() >= start && now.getTime() <= start + durationMs + 15 * 60_000;
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
      priceMinor: t.priceMinor,
      currency: t.currency,
      durationSeconds: t.durationSeconds,
      isPremiere: t.isPremiere,
      premiereStartAt: t.premiereStartAt,
      premiereLive: CatalogueService.premiereIsLive(t),
      hasVideo: Boolean(t.videoKey),
    };
  }

  private toAdminDetail(t: Title): AdminTitleDto {
    return {
      ...this.toDetail(t),
      status: t.status,
      featured: t.featured,
      videoKey: t.videoKey,
      posterKey: t.posterKey,
      heroKey: t.heroKey,
      popularity: t.popularity,
    };
  }

  /** Used by the watchlist module to enrich saved items. */
  async summaryFor(id: string): Promise<TitleSummaryDto | null> {
    const t = await this.repo.findById(id);
    return t ? this.toSummary(t) : null;
  }

  /** Raw domain entity — for commerce/playback that need price, video key, etc. */
  async findRaw(id: string): Promise<Title | null> {
    return this.repo.findById(id);
  }

  async listPremieres() {
    const premieres = await this.repo.listPremieres();
    return premieres.map((t) => this.toDetail(t));
  }

  // ── Admin surface ───────────────────────────────────────────────────────────

  async adminList(): Promise<AdminTitleDto[]> {
    return (await this.repo.listAll()).map((t) => this.toAdminDetail(t));
  }

  async adminGet(id: string): Promise<AdminTitleDto> {
    const t = await this.repo.findById(id);
    if (!t) throw new NotFoundException('Title not found');
    return this.toAdminDetail(t);
  }

  async createTitle(input: Title): Promise<AdminTitleDto> {
    const saved = await this.repo.save(input);
    return this.toAdminDetail(saved);
  }

  async updateTitle(id: string, patch: Partial<Title>): Promise<AdminTitleDto> {
    const updated = await this.repo.update(id, patch);
    return this.toAdminDetail(updated);
  }

  async setFeatured(id: string, featured: boolean): Promise<void> {
    await this.repo.setFeatured(id, featured);
  }

  /** Permanently remove a title (admin). Callers 404-check via findRaw first. */
  async deleteTitle(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
