import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { GooglePlayVerifier } from '../commerce/drivers/google-play.verifier';
import { STORE_COIN_PACKS } from './store-coin-products';
import { WalletService, isUniqueViolation } from './wallet.service';

@Injectable()
export class GooglePlayCoinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: GooglePlayVerifier,
    private readonly wallet: WalletService,
    private readonly config: ConfigService,
  ) {}

  products() {
    if (!this.verifier.isConfigured()) {
      throw new ServiceUnavailableException('Google Play purchases are not configured');
    }
    return STORE_COIN_PACKS;
  }

  async confirm(userId: string, productId: string, purchaseToken: string) {
    const pack = STORE_COIN_PACKS.find((candidate) => candidate.productId === productId);
    if (!pack) throw new BadRequestException('Invalid Google Play coin product');

    const purchase = await this.verifier.verifyPurchase(productId, purchaseToken);
    if (purchase.productId && purchase.productId !== productId) {
      throw new BadRequestException('Google Play product mismatch');
    }
    if (purchase.purchaseState !== 0 || (purchase.quantity ?? 1) !== 1) {
      throw new BadRequestException('Google Play purchase is not completed');
    }
    if (purchase.obfuscatedExternalAccountId !== googlePlayAccountId(userId)) {
      throw new UnauthorizedException('This Google Play purchase belongs to another account');
    }
    // License-test transactions are free. Never allow them to mint transferable
    // coins in the production wallet; use the isolated IAP test backend instead.
    if (purchase.purchaseType === 0 && this.config.get<string>('env') === 'production') {
      throw new UnauthorizedException(
        'Google Play test purchases cannot credit production wallets',
      );
    }

    const tokenHash = createHash('sha256').update(purchaseToken).digest('hex');
    const reference = `google_play_${tokenHash}`;
    const before = await this.prisma.coinTopup.findUnique({ where: { reference } });
    if (purchase.consumptionState === 1 && !before) {
      throw new BadRequestException('Google Play purchase was already consumed');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.coinTopup.findUnique({ where: { reference } });
        if (existing) {
          if (
            existing.userId !== userId ||
            existing.coins !== pack.coins ||
            existing.status !== 'PAID'
          ) {
            throw new BadRequestException('Google Play purchase conflict');
          }
          return;
        }
        await tx.coinTopup.create({
          data: {
            userId,
            coins: pack.coins,
            amountMinor: pack.coins * 100,
            currency: 'NGN',
            provider: 'GOOGLE_PLAY',
            reference,
            status: 'PAID',
            paidAt: new Date(),
          },
        });
        await this.wallet.apply(tx, {
          userId,
          kind: 'TOPUP',
          delta: pack.coins,
          idempotencyKey: reference,
          note: `Google Play: ${productId}`,
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const first = await this.prisma.coinTopup.findUnique({ where: { reference } });
      if (
        !first ||
        first.userId !== userId ||
        first.coins !== pack.coins ||
        first.status !== 'PAID'
      ) {
        throw error;
      }
    }

    // Credit first, then consume. A transient consume failure is safe: retrying
    // this endpoint reuses the same reference and cannot credit twice.
    if (purchase.consumptionState !== 1) {
      await this.verifier.consume(productId, purchaseToken);
    }
    const balance = await this.prisma.coinWallet.findUnique({ where: { userId } });
    return { status: 'paid', coins: pack.coins, balance: (balance?.balance ?? 0) - (balance?.refundDebt ?? 0) };
  }
}

/** Non-PII account binding shared with BillingFlowParams on Android. */
export function googlePlayAccountId(userId: string): string {
  return createHash('sha256').update(userId.toLowerCase()).digest('hex');
}
