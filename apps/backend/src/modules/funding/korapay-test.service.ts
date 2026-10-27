import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { KorapayPaymentDriver } from '../commerce/drivers/korapay-payment.driver';
import { AppleCoinsService } from './apple-coins.service';
import { COIN_LIMITS, COIN_PACKS } from './domain/coins';

/** Live identities, simulated payments. No writes to live wallets or revenue. */
@Injectable()
export class KorapayTestService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService,
    private readonly sandbox: AppleCoinsService) {}

  private driver() {
    const key = this.config.get<string>('korapayTestSecretKey') ?? '';
    if (!key.startsWith('sk_test_')) throw new ServiceUnavailableException('Test checkout is unavailable.');
    return new KorapayPaymentDriver(key, 'https://api.cinnetemple.com/v1/wallet/korapay-test/webhook');
  }
  checkout() {
    return { enabled: (this.config.get<string>('korapayTestSecretKey') ?? '').startsWith('sk_test_'),
      environment: 'Sandbox', provider: 'KORAPAY', currency: 'NGN', nairaPerCoin: 1, packs: [...COIN_PACKS],
      custom: { min: COIN_LIMITS.topupMin, max: COIN_LIMITS.topupMax } };
  }
  async summary(userId: string) {
    const [wallet, topups, spends] = await Promise.all([
      this.sandbox.sandboxSummary(userId),
      this.prisma.korapayTestTopup.findMany({ where: { userId, status: 'PAID' }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.appleSandboxCoinSpend.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 }),
    ]);
    const entries = [...topups.map(t => ({ id: t.reference, kind: 'TEST_TOPUP', delta: t.coins,
      note: 'Korapay simulated payment', createdAt: t.createdAt.toISOString() })),
      ...spends.map(s => ({ id: s.id, kind: 'TEST_TICKET', delta: -s.coins,
        note: 'Test movie ticket', createdAt: s.createdAt.toISOString() }))]
      .sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,30);
    return { ...wallet, entries };
  }
  async start(user: { sub: string; email: string }, coins: number) {
    if (!Number.isSafeInteger(coins) || coins < COIN_LIMITS.topupMin || coins > COIN_LIMITS.topupMax)
      throw new BadRequestException(`Choose between ${COIN_LIMITS.topupMin} and ${COIN_LIMITS.topupMax} test coins.`);
    const driver = this.driver();
    const reference = 'koratest_' + randomUUID().replace(/-/g, '');
    await this.prisma.korapayTestTopup.create({ data: { reference, userId: user.sub, coins, amountMinor: coins * 100 } });
    const payment = await driver.initialize({ reference, amountMinor: coins * 100, currency: 'NGN', email: user.email,
      callbackUrl: 'https://www.cinnetemple.com/test/wallet/callback/' });
    return { ...payment, coins, status: 'pending' };
  }
  async verify(userId: string, reference: string) {
    if (!/^koratest_[a-f0-9]{32}$/.test(reference)) throw new NotFoundException('Test payment not found');
    const topup = await this.prisma.korapayTestTopup.findUnique({ where: { reference } });
    if (!topup || topup.userId !== userId) throw new NotFoundException('Test payment not found');
    let status = topup.status === 'PAID' ? 'paid' : 'pending';
    if (status !== 'paid') {
      const result = await this.driver().verify(reference);
      status = result.status;
      if (status === 'paid') {
        if (result.amountMinor !== topup.amountMinor || result.currency !== 'NGN')
          throw new BadRequestException('Test payment amount does not match.');
        // The unique payment row itself is the credit: replays cannot add coins.
        await this.prisma.korapayTestTopup.updateMany({ where: { reference, status: { in: ['PENDING','FAILED'] } }, data: { status: 'PAID' } });
      } else if (status === 'failed') {
        await this.prisma.korapayTestTopup.updateMany({ where: { reference, status: 'PENDING' }, data: { status: 'FAILED' } });
      }
    }
    return { status, coins: topup.coins, ...(await this.sandbox.sandboxSummary(userId)) };
  }
  async webhook(raw: string, signature: string | undefined) {
    if (!this.driver().verifyWebhookSignature(raw, signature)) throw new UnauthorizedException('Invalid test webhook signature');
    const body = JSON.parse(raw);
    const reference = body.data?.reference;
    if (body.event !== 'charge.success' || typeof reference !== 'string' || !/^koratest_[a-f0-9]{32}$/.test(reference)) return { received: true };
    const topup = await this.prisma.korapayTestTopup.findUnique({ where: { reference } });
    if (topup) await this.verify(topup.userId, reference);
    return { received: true };
  }
}
