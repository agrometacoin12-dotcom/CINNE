import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../auth/audit.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Updates the caller's profile with optimistic versioning and a history
   * snapshot of the previous state (version history requirement).
   */
  async update(userId: string, dto: UpdateProfileDto) {
    const current = await this.prisma.profile.findFirst({ where: { userId } });
    if (!current) throw new NotFoundException('Profile not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.profileHistory.create({
        data: {
          profileId: current.id,
          snapshot: {
            displayName: current.displayName,
            avatarUrl: current.avatarUrl,
            bio: current.bio,
            locale: current.locale,
            version: current.version,
          },
        },
      });
      return tx.profile.update({
        where: { id: current.id },
        data: {
          displayName: dto.displayName ?? current.displayName,
          avatarUrl: dto.avatarUrl ?? current.avatarUrl,
          bio: dto.bio ?? current.bio,
          locale: dto.locale ?? current.locale,
          version: { increment: 1 },
        },
      });
    });

    await this.audit.record({
      actorId: userId,
      action: 'profile.update',
      entity: 'Profile',
      entityId: current.id,
    });

    return {
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      bio: updated.bio,
      locale: updated.locale,
      version: updated.version,
    };
  }
}
