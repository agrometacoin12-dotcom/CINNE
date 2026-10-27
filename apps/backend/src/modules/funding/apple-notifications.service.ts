import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AppleIapVerifier } from '../commerce/drivers/apple-iap.verifier';
import { APPLE_COIN_PACKS } from './apple-coins.service';
import { WalletService } from './wallet.service';

@Injectable()
export class AppleNotificationsService {
  constructor(private readonly prisma: PrismaService,
    private readonly verifier: AppleIapVerifier,
    private readonly wallet: WalletService,
    private readonly config: ConfigService) {}

  async receive(signedPayload: string) {
    const n = await this.verifier.verifyNotification(signedPayload);
    const id = n.notificationUUID!;
    const type = n.notificationType!;
    const signedAt = BigInt(n.signedDate!);
    if (!['REFUND', 'REFUND_REVERSED'].includes(type)) {
      await this.prisma.appleStoreNotification.upsert({ where: { id }, update: {},
        create: { id, type, signedAt, outcome: type === 'TEST' ? 'test' : 'ignored' } });
      return { received: true };
    }
    if (!n.data?.signedTransactionInfo) throw new BadRequestException('Missing Apple transaction');
    const t = await this.verifier.verifyCoinTransaction(n.data.signedTransactionInfo);
    if (this.config.get<string>('env') === 'production' && !['Production', 'Sandbox'].includes(t.environment ?? '')) {
      throw new UnauthorizedException('Only production notifications can modify live wallets');
    }
    const pack = APPLE_COIN_PACKS.find(p => p.productId === t.productId);
    // Other products can share this app-level notification URL without affecting coins.
    if (!pack) {
      await this.prisma.appleStoreNotification.upsert({ where: { id }, update: {},
        create: { id, type, signedAt, transactionId: t.transactionId, outcome: 'other-product' } });
      return { received: true };
    }
    const refunded = type === 'REFUND';
    if (t.type !== 'Consumable' || t.quantity !== 1 || !t.appAccountToken ||
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(t.appAccountToken) ||
        (refunded && t.revocationDate == null)) {
      throw new BadRequestException('Invalid Apple coin refund');
    }
    if (t.environment === 'Sandbox' && this.config.get<string>('env') === 'production') {
      await this.prisma.$transaction(async tx => {
        const key = `apple_sandbox_${t.transactionId}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
        const ownerLock = `apple_sandbox_user_${t.appAccountToken!.toLowerCase()}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerLock}, 0))::text`;
        if (await tx.appleStoreNotification.findUnique({ where: { id } })) return;
        const old = await tx.appleSandboxCoinPurchase.findUnique({ where: { transactionId: t.transactionId } });
        if (old && (old.userId !== t.appAccountToken!.toLowerCase() || old.coins !== pack.coins)) {
          throw new BadRequestException('Sandbox refund identity conflict');
        }
        if (!old || signedAt > old.signedAt) {
          await tx.appleSandboxCoinPurchase.upsert({ where: { transactionId: t.transactionId },
            create: { transactionId: t.transactionId, userId: t.appAccountToken!.toLowerCase(),
              coins: pack.coins, refunded, signedAt }, update: { refunded, signedAt } });
        }
        await tx.appleStoreNotification.create({ data: { id, type, signedAt,
          transactionId: t.transactionId, outcome: 'sandbox-only' } });
      });
      return { received: true };
    }
    const reference = `apple_coin_${t.transactionId}`;
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reference}, 0))::text`;
      if (await tx.appleStoreNotification.findUnique({ where: { id } })) return;
      const previous = await tx.appleCoinRefundState.findUnique({ where: { transactionId: t.transactionId } });
      if (previous && (previous.userId !== t.appAccountToken!.toLowerCase() || previous.productId !== t.productId)) {
        throw new BadRequestException('Apple refund identity conflict');
      }
      if (previous && signedAt <= previous.signedAt) {
        await tx.appleStoreNotification.create({ data: { id, type, signedAt,
          transactionId: t.transactionId, outcome: 'stale' } });
        return;
      }
      const topup = await tx.coinTopup.findUnique({ where: { reference } });
      if (topup && (topup.provider !== 'APPLE_IAP' || topup.userId !== t.appAccountToken!.toLowerCase() || topup.coins !== pack.coins)) {
        throw new BadRequestException('Apple refund does not match the settled purchase');
      }
      if (topup && refunded && topup.status === 'PAID') {
        await this.wallet.apply(tx, { userId: topup.userId, kind: 'APPLE_REFUND', delta: -pack.coins,
          idempotencyKey: `apple_refund:${id}`, note: `Apple refund: ${t.productId}` });
        await tx.coinTopup.update({ where: { reference }, data: { status: 'REFUNDED' } });
      } else if (topup && !refunded && topup.status === 'REFUNDED') {
        await this.wallet.apply(tx, { userId: topup.userId, kind: 'APPLE_REFUND_REVERSAL', delta: pack.coins,
          idempotencyKey: `apple_refund_reversal:${id}`, note: `Apple reversed refund: ${t.productId}` });
        await tx.coinTopup.update({ where: { reference }, data: { status: 'PAID' } });
      }
      await tx.appleCoinRefundState.upsert({ where: { transactionId: t.transactionId },
        create: { transactionId: t.transactionId, productId: t.productId!, userId: t.appAccountToken!.toLowerCase(),
          refunded, signedAt, notificationId: id },
        update: { refunded, signedAt, notificationId: id } });
      await tx.appleStoreNotification.create({ data: { id, type, signedAt,
        transactionId: t.transactionId, outcome: topup ? 'applied' : 'recorded-before-settlement' } });
    });
    return { received: true };
  }
}
