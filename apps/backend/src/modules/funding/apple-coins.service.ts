import { ConfigService } from '@nestjs/config';
import { BadRequestException, Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AppleIapVerifier } from '../commerce/drivers/apple-iap.verifier';
import { WalletService, isUniqueViolation } from './wallet.service';
import { STORE_COIN_PACKS } from './store-coin-products';

export const APPLE_COIN_PACKS = STORE_COIN_PACKS;

@Injectable()
export class AppleCoinsService {
  constructor(private readonly prisma: PrismaService,
    private readonly verifier: AppleIapVerifier, private readonly wallet: WalletService,
    private readonly config: ConfigService) {}

  products() {
    if (!this.verifier.isConfigured()) throw new ServiceUnavailableException('Apple purchases are not configured');
    return APPLE_COIN_PACKS;
  }

  async confirm(userId: string, signedTransaction: string) {
    const t = await this.verifier.verifyCoinTransaction(signedTransaction);
    const pack = APPLE_COIN_PACKS.find(p => p.productId === t.productId);
    if (!pack || t.type !== 'Consumable' || t.quantity !== 1 || t.revocationDate != null) {
      throw new BadRequestException('Invalid Apple coin purchase');
    }
    if (t.appAccountToken?.toLowerCase() !== userId.toLowerCase()) {
      throw new UnauthorizedException('This Apple purchase belongs to another account');
    }
    if (this.config.get<string>('env') === 'production' && t.environment === 'Sandbox') {
      await this.prisma.$transaction(async tx => {
        const key = `apple_sandbox_${t.transactionId}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
        const ownerLock = `apple_sandbox_user_${userId}`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerLock}, 0))::text`;
        const old = await tx.appleSandboxCoinPurchase.findUnique({ where: { transactionId: t.transactionId } });
        if (old && (old.userId !== userId || old.coins !== pack.coins || old.refunded)) {
          throw new BadRequestException('Sandbox purchase conflict or refund');
        }
        await tx.appleSandboxCoinPurchase.upsert({ where: { transactionId: t.transactionId },
          create: { transactionId: t.transactionId, userId, coins: pack.coins, confirmed: true },
          update: { confirmed: true } });
      });
      return { status: 'paid', coins: pack.coins, ...(await this.sandboxSummary(userId)) };
    }
    if (this.config.get<string>('env') === 'production' && t.environment !== 'Production') {
      throw new UnauthorizedException('Only verified production purchases can credit live wallets');
    }
    const reference = `apple_coin_${t.transactionId}`;
    try {
      await this.prisma.$transaction(async tx => {
        // Serialize settlement with refund callbacks, including callbacks that
        // arrive before a top-up exists. Row locks alone cannot lock that gap.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${reference}, 0))::text`;
        const refund = await tx.appleCoinRefundState.findUnique({ where: { transactionId: t.transactionId } });
        if (refund?.refunded) throw new UnauthorizedException('This Apple purchase was refunded');
        const existing = await tx.coinTopup.findUnique({ where: { reference } });
        if (existing) {
          if (existing.userId !== userId || existing.coins !== pack.coins || existing.status !== 'PAID') {
            throw new BadRequestException('Apple purchase conflict');
          }
          return;
        }
        // Nominal NGN coin value, not Apple's net proceeds or foreign-currency charge.
        await tx.coinTopup.create({ data: {
          userId, coins: pack.coins, amountMinor: pack.coins * 100, currency: 'NGN',
          provider: 'APPLE_IAP', reference, status: 'PAID', paidAt: new Date(),
        } });
        await this.wallet.apply(tx, { userId, kind: 'TOPUP', delta: pack.coins,
          idempotencyKey: reference, note: `Apple: ${pack.productId}` });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const first = await this.prisma.coinTopup.findUnique({ where: { reference } });
      if (!first || first.userId !== userId || first.coins !== pack.coins || first.status !== 'PAID') throw error;
    }
    const balance = await this.prisma.coinWallet.findUnique({ where: { userId } });
    return { status: 'paid', coins: pack.coins, balance: (balance?.balance ?? 0) - (balance?.refundDebt ?? 0) };
  }

  async sandboxSummary(userId: string) {
    const total = await this.prisma.appleSandboxCoinPurchase.aggregate({
      where: { userId, confirmed: true, refunded: false }, _sum: { coins: true } });
    const kora = await this.prisma.korapayTestTopup.aggregate({ where: { userId, status: 'PAID' }, _sum: { coins: true } });
    const spent = await this.prisma.appleSandboxCoinSpend.aggregate({ where: { userId }, _sum: { coins: true } });
    return { balance: (total._sum.coins ?? 0) + (kora._sum.coins ?? 0) - (spent._sum.coins ?? 0), environment: 'Sandbox' };
  }
}
