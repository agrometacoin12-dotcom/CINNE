import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, PurchaseStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CatalogueService } from '../catalogue/catalogue.service';
import { MediaService } from '../media/media.service';
import { AuditService } from '../auth/audit.service';
import { EventBus } from '../../infra/events/event-bus';
import { NEW_LISTINGS_CATEGORY, type Title } from '../catalogue/domain/title.entity';
import type {
  CreateMovieDto,
  PresignUploadDto,
  SetPremiereDto,
  UpdateMovieDto,
} from './dto/admin.dto';

/** Relations needed to render the public admin user shape. */
const USER_INCLUDE = {
  profile: true,
  roles: { include: { role: true } },
  _count: { select: { purchases: true } },
} satisfies Prisma.UserInclude;

type AdminUserRecord = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

const PURCHASE_STATUSES: readonly string[] = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Clamp a (possibly NaN) pagination number into a sane range. */
const clamp = (value: number | undefined, fallback: number, min: number, max: number) => {
  const n = Number.isFinite(value) ? (value as number) : fallback;
  return Math.min(Math.max(n, min), max);
};

@Injectable()
export class AdminService {
  private readonly defaultCurrency: string;

  constructor(
    private readonly catalogue: CatalogueService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.defaultCurrency = config.get<string>('defaultCurrency') ?? 'NGN';
  }

  list() {
    return this.catalogue.adminList();
  }

  get(id: string) {
    return this.catalogue.adminGet(id);
  }

  async create(dto: CreateMovieDto, actorId: string) {
    const id = randomUUID();
    const title: Title = {
      id,
      type: dto.type ?? 'movie',
      title: dto.title,
      tagline: dto.tagline ?? null,
      overview: dto.overview,
      year: dto.year,
      genres: dto.genres ?? [],
      runtimeMinutes: dto.runtimeMinutes ?? null,
      seasons: null,
      maturityRating: dto.maturityRating ?? null,
      rating: 0,
      posterKey: dto.posterKey ?? null,
      heroKey: dto.heroKey ?? null,
      cast: dto.cast ?? [],
      director: dto.director ?? null,
      // Always include "new-listings" so every admin upload surfaces in the
      // New Listings row for users, regardless of any categories chosen.
      categories: [...new Set([...(dto.categories ?? []), NEW_LISTINGS_CATEGORY])],
      popularity: dto.popularity ?? 50,
      featured: false,
      status: dto.status ?? 'draft',
      priceMinor: dto.priceMinor ?? 0,
      currency: dto.currency ?? this.defaultCurrency,
      videoKey: dto.videoKey ?? null,
      durationSeconds: dto.durationSeconds ?? (dto.runtimeMinutes ? dto.runtimeMinutes * 60 : null),
      isPremiere: dto.isPremiere ?? false,
      premiereStartAt: dto.premiereStartAt ?? null,
    };
    const created = await this.catalogue.createTitle(title);
    await this.audit.record({
      actorId,
      action: 'admin.movie.create',
      entity: 'Title',
      entityId: id,
    });
    await this.events.publish({ name: 'movie.created', detail: { titleId: id, title: dto.title } });
    return created;
  }

  async update(id: string, dto: UpdateMovieDto, actorId: string) {
    const existing = await this.catalogue.findRaw(id);
    if (!existing) throw new NotFoundException('Title not found');

    // Premiere invariants: a premiere always has a showtime. The effective
    // showtime is the payload's (including an explicit null-clear) or, when
    // untouched, the stored one.
    const effectivePremiereStartAt =
      dto.premiereStartAt !== undefined ? dto.premiereStartAt : existing.premiereStartAt;
    const effectiveIsPremiere = dto.isPremiere !== undefined ? dto.isPremiere : existing.isPremiere;
    const touchesPremiere = dto.isPremiere !== undefined || dto.premiereStartAt !== undefined;
    if (touchesPremiere && effectiveIsPremiere && !effectivePremiereStartAt) {
      throw new BadRequestException('A premiere requires a showtime (premiereStartAt).');
    }

    const patch: Partial<Title> = {};
    // `undefined` = unchanged; explicit `null` = clear (nullable fields only).
    const assign = <K extends keyof Title>(k: K, v: Title[K] | undefined) => {
      if (v !== undefined) patch[k] = v;
    };
    assign('type', dto.type);
    assign('title', dto.title);
    assign('tagline', dto.tagline);
    assign('overview', dto.overview);
    assign('year', dto.year);
    assign('genres', dto.genres);
    assign('cast', dto.cast);
    assign('director', dto.director);
    // Keep "new-listings" on edit too, so re-saved uploads stay in the row.
    if (dto.categories) patch.categories = [...new Set([...dto.categories, NEW_LISTINGS_CATEGORY])];
    assign('maturityRating', dto.maturityRating);
    assign('runtimeMinutes', dto.runtimeMinutes);
    assign('durationSeconds', dto.durationSeconds);
    assign('priceMinor', dto.priceMinor);
    assign('currency', dto.currency);
    assign('posterKey', dto.posterKey);
    assign('heroKey', dto.heroKey);
    assign('videoKey', dto.videoKey);
    assign('popularity', dto.popularity);
    assign('status', dto.status);
    assign('isPremiere', dto.isPremiere);
    assign('premiereStartAt', dto.premiereStartAt);
    // Cancelling a premiere always clears its showtime.
    if (dto.isPremiere === false) patch.premiereStartAt = null;

    const updated = await this.catalogue.updateTitle(id, patch);
    await this.audit.record({
      actorId,
      action: 'admin.movie.update',
      entity: 'Title',
      entityId: id,
    });
    // A false→true transition schedules a premiere exactly like PUT /premiere.
    if (dto.isPremiere === true && !existing.isPremiere) {
      await this.events.publish({
        name: 'movie.premiere.scheduled',
        detail: { titleId: id, premiereStartAt: effectivePremiereStartAt },
      });
    }
    return updated;
  }

  async delete(id: string, actorId: string) {
    const existing = await this.catalogue.findRaw(id);
    if (!existing) throw new NotFoundException('Title not found');
    // Deleting a title with sold tickets is allowed, but leave a trace of how
    // many purchases pointed at it.
    const soldTickets = await this.prisma.purchase.count({ where: { titleId: id } });
    await this.catalogue.deleteTitle(id);
    await this.audit.record({
      actorId,
      action: 'admin.movie.delete',
      entity: 'Title',
      entityId: id,
      metadata: { title: existing.title, soldTickets },
    });
    return { deleted: true, id, soldTickets };
  }

  async setFeatured(id: string, featured: boolean, actorId: string) {
    await this.catalogue.setFeatured(id, featured);
    await this.audit.record({
      actorId,
      action: 'admin.movie.featured',
      entity: 'Title',
      entityId: id,
      metadata: { featured },
    });
    return this.catalogue.adminGet(id);
  }

  async setPremiere(id: string, dto: SetPremiereDto, actorId: string) {
    if (dto.isPremiere && !dto.premiereStartAt) {
      throw new BadRequestException('A premiere requires a showtime (premiereStartAt).');
    }
    const updated = await this.catalogue.updateTitle(id, {
      isPremiere: dto.isPremiere,
      premiereStartAt: dto.isPremiere ? (dto.premiereStartAt ?? null) : null,
    });
    await this.audit.record({
      actorId,
      action: 'admin.movie.premiere',
      entity: 'Title',
      entityId: id,
      metadata: { isPremiere: dto.isPremiere, premiereStartAt: dto.premiereStartAt },
    });
    await this.events.publish({
      name: 'movie.premiere.scheduled',
      detail: { titleId: id, premiereStartAt: dto.premiereStartAt },
    });
    return updated;
  }

  presignUpload(dto: PresignUploadDto) {
    return this.media.presignUpload(dto.kind, dto.contentType);
  }

  /** Metadata for an uploaded object (size, type) — Studio upload verification. */
  uploadStat(key?: string) {
    if (!key) throw new BadRequestException('Query parameter "key" is required.');
    return this.media.statObject(key);
  }

  /** Members list for the Studio — search by email/name, newest first. */
  async listUsers(query?: string, take = 50, skip = 0) {
    const where = query
      ? {
          OR: [
            { email: { contains: query, mode: 'insensitive' as const } },
            { profile: { displayName: { contains: query, mode: 'insensitive' as const } } },
          ],
        }
      : {};
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: USER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: clamp(take, 50, 1, 200),
        skip: clamp(skip, 0, 0, Number.MAX_SAFE_INTEGER),
      }),
    ]);
    return {
      total,
      users: users.map((u) => this.toPublicUser(u)),
    };
  }

  /** The public user shape returned by every admin user endpoint. */
  private toPublicUser(u: AdminUserRecord) {
    return {
      id: u.id,
      email: u.email,
      displayName: u.profile?.displayName ?? null,
      roles: u.roles.map((r) => r.role.name),
      status: u.status,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt.toISOString(),
      purchases: u._count.purchases,
    };
  }

  private async getUserOr404(id: string): Promise<AdminUserRecord> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Replace a member's role set. An admin can never demote themselves. */
  async setUserRoles(id: string, roles: string[], actorId: string) {
    const nextRoles = [...new Set(roles)];
    const user = await this.getUserOr404(id);
    const previousRoles = user.roles.map((r) => r.role.name);

    if (id === actorId && previousRoles.includes('admin') && !nextRoles.includes('admin')) {
      throw new ForbiddenException('You cannot remove your own admin role.');
    }

    const roleRows = await Promise.all(
      nextRoles.map((name) =>
        this.prisma.role.upsert({ where: { name }, update: {}, create: { name } }),
      ),
    );
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      ...(roleRows.length
        ? [
            this.prisma.userRole.createMany({
              data: roleRows.map((r) => ({ userId: id, roleId: r.id })),
            }),
          ]
        : []),
    ]);
    await this.audit.record({
      actorId,
      action: 'admin.user.roles',
      entity: 'User',
      entityId: id,
      metadata: { roles: nextRoles, previousRoles },
    });
    return this.toPublicUser(await this.getUserOr404(id));
  }

  /** Suspend or reactivate a member. Suspended accounts cannot log in. */
  async setUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', actorId: string) {
    const user = await this.getUserOr404(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { status },
      include: USER_INCLUDE,
    });
    await this.audit.record({
      actorId,
      action: 'admin.user.status',
      entity: 'User',
      entityId: id,
      metadata: { status, previousStatus: user.status },
    });
    return this.toPublicUser(updated);
  }

  /** Force-verify a member's email (e.g. a lost verification code). */
  async verifyUser(id: string, actorId: string) {
    const user = await this.getUserOr404(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        emailVerified: true,
        // Mirror the self-serve verification flow, which activates the account.
        ...(user.status === 'PENDING_VERIFICATION' ? { status: 'ACTIVE' as const } : {}),
      },
      include: USER_INCLUDE,
    });
    await this.audit.record({
      actorId,
      action: 'admin.user.verify',
      entity: 'User',
      entityId: id,
      metadata: { previousEmailVerified: user.emailVerified, previousStatus: user.status },
    });
    return this.toPublicUser(updated);
  }

  /** Sales ledger — purchases joined with buyer, title and entitlement state. */
  async listPurchases(params: {
    q?: string;
    titleId?: string;
    status?: string;
    take?: number;
    skip?: number;
  }) {
    const { q, titleId, status } = params;
    if (status && !PURCHASE_STATUSES.includes(status)) {
      throw new BadRequestException(`status must be one of ${PURCHASE_STATUSES.join(', ')}`);
    }
    if (titleId && !UUID_RE.test(titleId)) {
      throw new BadRequestException('titleId must be a UUID');
    }
    const where: Prisma.PurchaseWhereInput = {
      ...(titleId ? { titleId } : {}),
      ...(status ? { status: status as PurchaseStatus } : {}),
      ...(q
        ? {
            OR: [
              { titleName: { contains: q, mode: 'insensitive' as const } },
              { user: { email: { contains: q, mode: 'insensitive' as const } } },
              { user: { profile: { displayName: { contains: q, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
    };
    const [total, purchases] = await this.prisma.$transaction([
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.findMany({
        where,
        include: { user: { include: { profile: true } }, entitlement: true },
        orderBy: { createdAt: 'desc' },
        take: clamp(params.take, 50, 1, 200),
        skip: clamp(params.skip, 0, 0, Number.MAX_SAFE_INTEGER),
      }),
    ]);
    return {
      total,
      items: purchases.map((p) => ({
        id: p.id,
        userId: p.userId,
        userEmail: p.user.email,
        userDisplayName: p.user.profile?.displayName ?? null,
        titleId: p.titleId,
        titleName: p.titleName,
        amountMinor: p.amountMinor,
        currency: p.currency,
        provider: p.provider,
        status: p.status,
        isGift: p.isGift,
        entitlementStatus: p.entitlement?.status ?? null,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
      })),
    };
  }

  /** Audit feed — newest first, with the acting user's email when known. */
  async listAudit(take = 50, skip = 0) {
    const [total, records] = await this.prisma.$transaction([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findMany({
        include: { actor: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        take: clamp(take, 50, 1, 200),
        skip: clamp(skip, 0, 0, Number.MAX_SAFE_INTEGER),
      }),
    ]);
    return {
      total,
      items: records.map((r) => ({
        id: r.id,
        actorId: r.actorId,
        actorEmail: r.actor?.email ?? null,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        metadata: r.metadata,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  /** Studio overview: members, catalogue and revenue at a glance. */
  async stats() {
    const [users, purchases, activeEntitlements, revenueRows, titles] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.purchase.count({ where: { status: 'PAID' } }),
      this.prisma.entitlement.count({ where: { status: 'ACTIVE' } }),
      this.prisma.purchase.groupBy({
        by: ['currency'],
        where: { status: 'PAID' },
        _sum: { amountMinor: true },
      }),
      this.catalogue.adminList(),
    ]);
    return {
      users,
      titles: titles.length,
      published: titles.filter((t) => t.status === 'published').length,
      purchases,
      activeEntitlements,
      revenue: revenueRows.map((r) => ({
        currency: r.currency,
        totalMinor: r._sum.amountMinor ?? 0,
      })),
    };
  }
}
