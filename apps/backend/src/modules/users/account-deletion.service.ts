import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class AccountDeletionService {
  constructor(private readonly prisma: PrismaService) {}

  async delete(userId: string) {
    await this.prisma.$transaction(async tx => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('Account not found');
      if (user.deletedAt) return;
      // Retain pseudonymous monetary records for refunds, tax and fraud checks.
      // Personal profile/activity and all reusable authentication are removed.
      await tx.session.deleteMany({ where: { userId } });
      await tx.credential.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.watchlistItem.deleteMany({ where: { userId } });
      await tx.playbackProgress.deleteMany({ where: { userId } });
      await tx.episodePlayback.deleteMany({ where: { userId } });
      await tx.premiereChatMessage.deleteMany({ where: { userId } });
      await tx.desktopAuthCode.deleteMany({ where: { userId } });
      await tx.profile.deleteMany({ where: { userId } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.user.update({ where: { id: userId }, data: {
        email: `deleted-${userId}@account.invalid`, passwordHash: null, cognitoSub: null,
        phoneNumberEnc: null, emailVerified: false, mfaEnabled: false,
        status: 'DEACTIVATED', deletedAt: new Date(), version: { increment: 1 },
      } });
      await tx.auditLog.create({ data: { actorId: userId, action: 'account.deleted', entityId: userId } });
    });
    return { deleted: true };
  }
}
