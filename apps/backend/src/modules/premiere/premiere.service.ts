import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { EventBus } from '../../infra/events/event-bus';
import { CatalogueService } from '../catalogue/catalogue.service';
import { EntitlementService } from '../commerce/entitlement.service';
import { UsersRepository } from '../users/users.repository';

export interface ChatMessageDto {
  id: string;
  author: string;
  body: string;
  userId: string;
  createdAt: string;
}

@Injectable()
export class PremiereService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly entitlements: EntitlementService,
    private readonly users: UsersRepository,
    private readonly events: EventBus,
  ) {}

  /** All premieres (upcoming + live) for the premieres rail. */
  list() {
    return this.catalogue.listPremieres();
  }

  /** Room metadata: live state + whether this viewer may chat (is entitled). */
  async room(userId: string, titleId: string) {
    const title = await this.catalogue.findRaw(titleId);
    if (!title || !title.isPremiere) throw new NotFoundException('Premiere not found');
    const live = CatalogueService.premiereIsLive(title);
    const entitled = await this.entitlements.hasUsable(userId, titleId);
    return {
      titleId,
      title: title.title,
      live,
      premiereStartAt: title.premiereStartAt,
      canChat: live && entitled,
      entitled,
    };
  }

  async messages(userId: string, titleId: string, since?: string): Promise<ChatMessageDto[]> {
    if (!(await this.entitlements.hasUsable(userId, titleId))) {
      throw new ForbiddenException('Purchase the premiere to join the chat');
    }
    const rows = await this.prisma.premiereChatMessage.findMany({
      where: {
        titleId,
        ...(since ? { createdAt: { gt: new Date(since) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map((m) => ({
      id: m.id,
      author: m.author,
      body: m.body,
      userId: m.userId,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async post(userId: string, titleId: string, body: string): Promise<ChatMessageDto> {
    const title = await this.catalogue.findRaw(titleId);
    if (!title || !title.isPremiere) throw new NotFoundException('Premiere not found');
    if (!CatalogueService.premiereIsLive(title)) {
      throw new ForbiddenException('The premiere chat is only open while it is live');
    }
    if (!(await this.entitlements.hasUsable(userId, titleId))) {
      throw new ForbiddenException('Purchase the premiere to join the chat');
    }
    const user = await this.users.findById(userId);
    const author = user?.profile?.displayName ?? user?.email?.split('@')[0] ?? 'Guest';

    const msg = await this.prisma.premiereChatMessage.create({
      data: { titleId, userId, author, body: body.trim().slice(0, 500) },
    });
    await this.events.publish({
      name: 'premiere.chat.message',
      detail: { titleId, messageId: msg.id, userId },
    });
    return {
      id: msg.id,
      author: msg.author,
      body: msg.body,
      userId: msg.userId,
      createdAt: msg.createdAt.toISOString(),
    };
  }
}
