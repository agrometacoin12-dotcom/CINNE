import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EventBus } from '../../infra/events/event-bus';
import { AuditService } from '../auth/audit.service';
import { CatalogueService } from '../catalogue/catalogue.service';

@Injectable()
export class WatchlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly audit: AuditService,
    private readonly events: EventBus,
  ) {}

  async list(userId: string) {
    const items = await this.prisma.watchlistItem.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    // Enrich with denormalized title summaries from the catalogue store.
    const enriched = await Promise.all(
      items.map(async (item) => ({
        titleId: item.titleId,
        addedAt: item.createdAt.toISOString(),
        title: await this.catalogue.summaryFor(item.titleId),
      })),
    );
    return enriched;
  }

  async add(userId: string, titleId: string) {
    await this.prisma.watchlistItem.upsert({
      where: { userId_titleId: { userId, titleId } },
      update: { deletedAt: null },
      create: { userId, titleId },
    });
    await this.audit.record({
      actorId: userId,
      action: 'watchlist.add',
      entity: 'Title',
      entityId: titleId,
    });
    await this.events.publish({
      name: 'watchlist.added',
      detail: { userId, titleId },
    });
    return { success: true };
  }

  /** Soft-deletes the saved title. */
  async remove(userId: string, titleId: string) {
    await this.prisma.watchlistItem.updateMany({
      where: { userId, titleId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      actorId: userId,
      action: 'watchlist.remove',
      entity: 'Title',
      entityId: titleId,
    });
    return { success: true };
  }
}
