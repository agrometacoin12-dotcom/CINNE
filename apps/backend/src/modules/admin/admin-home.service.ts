import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { HomepageSection, Prisma } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../auth/audit.service';
import { HomeService } from '../catalogue/home/home.service';
import { parseSectionRules } from '../catalogue/home/section-rules';
import type {
  CreateCollectionDto,
  UpdateCollectionDto,
  UpdateHomeSectionDto,
} from './dto/admin-classification.dto';

export interface HomeSectionDto {
  id: string;
  slug: string;
  title: string;
  kind: HomepageSection['kind'];
  rules: unknown;
  sort: HomepageSection['sort'];
  limit: number;
  minItems: number;
  enabled: boolean;
  position: number;
  pinnedTitleIds: string[];
  excludedTitleIds: string[];
  /** Null for per-viewer kinds (computed by the apps). */
  eligibleCount: number | null;
  /** Would show on browse right now. */
  live: boolean;
}

export interface CollectionDto {
  slug: string;
  name: string;
  kind: 'EDITORIAL' | 'SYSTEM';
  description: string | null;
}

/** Order-preserving de-duplication. */
const uniq = (xs: string[]) => [...new Set(xs)];

/**
 * Admin surface for the rule-based homepage: section settings and order, a
 * browse preview, and editorial collections. Every write is audited and drops
 * the browse cache.
 */
@Injectable()
export class AdminHomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly home: HomeService,
  ) {}

  /** Every section in position order, with eligible counts and live state. */
  async listSections(): Promise<HomeSectionDto[]> {
    const [sections, counts] = await Promise.all([
      this.prisma.homepageSection.findMany({ orderBy: [{ position: 'asc' }, { slug: 'asc' }] }),
      this.home.sectionsWithCounts(),
    ]);
    return sections.map((s) => toSectionDto(s, counts.get(s.id)));
  }

  async updateSection(
    id: string,
    dto: UpdateHomeSectionDto,
    actorId: string,
  ): Promise<HomeSectionDto> {
    const existing = await this.prisma.homepageSection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Home section not found');

    const data: Prisma.HomepageSectionUpdateInput = {};
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('title must not be empty');
      data.title = title;
    }
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.sort !== undefined) data.sort = dto.sort;
    if (dto.limit !== undefined) data.limit = assertRange('limit', dto.limit);
    if (dto.minItems !== undefined) data.minItems = assertRange('minItems', dto.minItems);
    if (dto.rules !== undefined) {
      try {
        data.rules = parseSectionRules(dto.rules) as Prisma.InputJsonValue;
      } catch (err) {
        throw new BadRequestException(
          `Invalid rules: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const pinned = dto.pinnedTitleIds !== undefined ? uniq(dto.pinnedTitleIds) : undefined;
    const excluded = dto.excludedTitleIds !== undefined ? uniq(dto.excludedTitleIds) : undefined;
    const referenced = uniq([...(pinned ?? []), ...(excluded ?? [])]);
    if (referenced.length) {
      const found = await this.prisma.catalogueTitle.findMany({
        where: { id: { in: referenced } },
        select: { id: true },
      });
      const known = new Set(found.map((t) => t.id));
      const unknown = referenced.filter((t) => !known.has(t));
      if (unknown.length) throw new BadRequestException(`Unknown title ids: ${unknown.join(', ')}`);
    }
    const effPinned = pinned ?? existing.pinnedTitleIds;
    const effExcluded = excluded ?? existing.excludedTitleIds;
    const both = effPinned.filter((t) => effExcluded.includes(t));
    if (both.length) {
      throw new BadRequestException(
        `Titles cannot be both pinned and excluded: ${both.join(', ')}`,
      );
    }
    if (pinned) data.pinnedTitleIds = pinned;
    if (excluded) data.excludedTitleIds = excluded;

    const updated = await this.prisma.homepageSection.update({ where: { id }, data });
    await this.audit.record({
      actorId,
      action: 'admin.home-section.update',
      entity: 'HomepageSection',
      entityId: id,
      metadata: { slug: existing.slug, fields: Object.keys(data) },
    });
    this.home.invalidate();
    const counts = await this.home.sectionsWithCounts();
    return toSectionDto(updated, counts.get(id));
  }

  /** Reorder: `ids` must list every section exactly once. */
  async reorderSections(ids: string[], actorId: string): Promise<HomeSectionDto[]> {
    const sections = await this.prisma.homepageSection.findMany({ select: { id: true } });
    const known = new Set(sections.map((s) => s.id));
    const unique = new Set(ids);
    const unknown = ids.filter((id) => !known.has(id));
    const missing = sections.filter((s) => !unique.has(s.id)).map((s) => s.id);
    if (unique.size !== ids.length) throw new BadRequestException('ids must not repeat');
    if (unknown.length) throw new BadRequestException(`Unknown section ids: ${unknown.join(', ')}`);
    if (missing.length) throw new BadRequestException(`Missing section ids: ${missing.join(', ')}`);

    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.homepageSection.update({ where: { id }, data: { position } }),
      ),
    );
    await this.audit.record({
      actorId,
      action: 'admin.home-section.reorder',
      entity: 'HomepageSection',
      metadata: { ids },
    });
    this.home.invalidate();
    return this.listSections();
  }

  /** Exactly what browse would return, plus why every other section is hidden. */
  preview() {
    return this.home.preview();
  }

  async createCollection(dto: CreateCollectionDto, actorId: string): Promise<CollectionDto> {
    const slug = dto.slug.trim().toLowerCase();
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('name must not be empty');
    const exists = await this.prisma.collection.findUnique({ where: { slug } });
    if (exists) throw new ConflictException(`Collection "${slug}" already exists`);
    const last = await this.prisma.collection.aggregate({ _max: { position: true } });
    const created = await this.prisma.collection.create({
      data: {
        slug,
        name,
        kind: 'EDITORIAL',
        description: dto.description?.trim() || null,
        position: (last._max.position ?? -1) + 1,
      },
    });
    await this.audit.record({
      actorId,
      action: 'admin.collection.create',
      entity: 'Collection',
      entityId: created.id,
      metadata: { slug },
    });
    this.home.invalidate();
    return toCollectionDto(created);
  }

  async updateCollection(
    slug: string,
    dto: UpdateCollectionDto,
    actorId: string,
  ): Promise<CollectionDto> {
    const existing = await this.prisma.collection.findUnique({ where: { slug } });
    if (!existing) throw new NotFoundException('Collection not found');
    const data: Prisma.CollectionUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('name must not be empty');
      data.name = name;
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    const updated = Object.keys(data).length
      ? await this.prisma.collection.update({ where: { slug }, data })
      : existing;
    await this.audit.record({
      actorId,
      action: 'admin.collection.update',
      entity: 'Collection',
      entityId: existing.id,
      metadata: { slug, fields: Object.keys(data) },
    });
    this.home.invalidate();
    return toCollectionDto(updated);
  }
}

function assertRange(field: string, value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new BadRequestException(`${field} must be an integer from 1 to 50`);
  }
  return value;
}

function toSectionDto(
  s: HomepageSection,
  count: { eligibleCount: number | null; live: boolean } | undefined,
): HomeSectionDto {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    kind: s.kind,
    rules: s.rules,
    sort: s.sort,
    limit: s.limit,
    minItems: s.minItems,
    enabled: s.enabled,
    position: s.position,
    pinnedTitleIds: s.pinnedTitleIds ?? [],
    excludedTitleIds: s.excludedTitleIds ?? [],
    eligibleCount: count ? count.eligibleCount : null,
    live: count?.live ?? false,
  };
}

function toCollectionDto(c: {
  slug: string;
  name: string;
  kind: 'EDITORIAL' | 'SYSTEM';
  description: string | null;
}): CollectionDto {
  return { slug: c.slug, name: c.name, kind: c.kind, description: c.description };
}
