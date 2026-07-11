import { Injectable } from '@nestjs/common';
import type { CatalogueTitle as CatalogueTitleRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { CatalogueRepository } from '../domain/catalogue.repository';
import type { Title, TitleStatus, TitleType } from '../domain/title.entity';

/**
 * Postgres-backed catalogue store (the production default). Titles survive
 * restarts and deploys — everything admins create lives in the same database
 * as users, purchases, and entitlements.
 *
 * Public read paths (browse rows, search, featured, premieres) only surface
 * PUBLISHED titles, matching the production DynamoDB semantics; drafts are
 * visible through `listAll`/`findById` for the admin console and playback.
 */
@Injectable()
export class PrismaCatalogueRepository implements CatalogueRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByCategory(category: string, limit = 20): Promise<Title[]> {
    const rows = await this.prisma.catalogueTitle.findMany({
      where: { categories: { has: category }, status: 'PUBLISHED' },
      orderBy: { popularity: 'desc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async findById(id: string): Promise<Title | null> {
    const row = await this.prisma.catalogueTitle.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async search(query: string, limit = 30): Promise<Title[]> {
    // Naive substring match over title/overview/cast/genres, mirroring the
    // local driver (OpenSearch takes over at scale). The catalogue is small,
    // so filtering published rows in memory is fine.
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const rows = await this.prisma.catalogueTitle.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { popularity: 'desc' },
    });
    return rows
      .map(toDomain)
      .filter((t) =>
        [t.title, t.overview, ...t.cast, ...t.genres].join(' ').toLowerCase().includes(q),
      )
      .slice(0, limit);
  }

  async featured(): Promise<Title | null> {
    const row =
      (await this.prisma.catalogueTitle.findFirst({
        where: { featured: true, status: 'PUBLISHED' },
      })) ??
      // No explicit hero: fall back to the most popular published title so the
      // browse page never renders without a hero (parity with the local driver).
      (await this.prisma.catalogueTitle.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { popularity: 'desc' },
      }));
    return row ? toDomain(row) : null;
  }

  // ── Admin / write surface ──────────────────────────────────────────────────

  async listAll(): Promise<Title[]> {
    const rows = await this.prisma.catalogueTitle.findMany({
      orderBy: { popularity: 'desc' },
    });
    return rows.map(toDomain);
  }

  async listPremieres(): Promise<Title[]> {
    const rows = await this.prisma.catalogueTitle.findMany({
      where: { isPremiere: true, status: 'PUBLISHED' },
      orderBy: { premiereStartAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async save(title: Title): Promise<Title> {
    const data = toRow(title);
    const row = await this.prisma.catalogueTitle.upsert({
      where: { id: title.id },
      update: data,
      create: data,
    });
    return toDomain(row);
  }

  async update(id: string, patch: Partial<Title>): Promise<Title> {
    const existing = await this.findById(id);
    if (!existing) throw new Error(`Title ${id} not found`);
    const merged: Title = { ...existing, ...patch, id };
    return this.save(merged);
  }

  async setFeatured(id: string, featured: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (featured) {
        await tx.catalogueTitle.updateMany({
          where: { featured: true, NOT: { id } },
          data: { featured: false },
        });
      }
      // updateMany: setting the flag on a missing id is a silent no-op,
      // matching the local driver's behaviour.
      await tx.catalogueTitle.updateMany({ where: { id }, data: { featured } });
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.catalogueTitle.deleteMany({ where: { id } });
  }
}

// MARK: - Row ↔ domain mapping

function toDomain(row: CatalogueTitleRow): Title {
  return {
    id: row.id,
    type: row.type.toLowerCase() as TitleType,
    title: row.title,
    tagline: row.tagline,
    overview: row.overview,
    year: row.year,
    genres: row.genres,
    runtimeMinutes: row.runtimeMinutes,
    seasons: row.seasons,
    maturityRating: row.maturityRating,
    rating: row.rating,
    posterKey: row.posterKey,
    heroKey: row.heroKey,
    cast: row.cast,
    director: row.director,
    categories: row.categories,
    popularity: row.popularity,
    featured: row.featured,
    status: row.status.toLowerCase() as TitleStatus,
    priceMinor: row.priceMinor,
    currency: row.currency,
    videoKey: row.videoKey,
    durationSeconds: row.durationSeconds,
    isPremiere: row.isPremiere,
    premiereStartAt: row.premiereStartAt ? row.premiereStartAt.toISOString() : null,
  };
}

function toRow(t: Title) {
  return {
    id: t.id,
    type: t.type.toUpperCase() as CatalogueTitleRow['type'],
    title: t.title,
    tagline: t.tagline,
    overview: t.overview,
    year: t.year,
    genres: t.genres,
    runtimeMinutes: t.runtimeMinutes,
    seasons: t.seasons,
    maturityRating: t.maturityRating,
    rating: t.rating,
    posterKey: t.posterKey,
    heroKey: t.heroKey,
    cast: t.cast,
    director: t.director,
    categories: t.categories,
    popularity: t.popularity,
    featured: t.featured,
    status: t.status.toUpperCase() as CatalogueTitleRow['status'],
    priceMinor: t.priceMinor,
    currency: t.currency,
    videoKey: t.videoKey,
    durationSeconds: t.durationSeconds,
    isPremiere: t.isPremiere,
    premiereStartAt: t.premiereStartAt ? new Date(t.premiereStartAt) : null,
  };
}
