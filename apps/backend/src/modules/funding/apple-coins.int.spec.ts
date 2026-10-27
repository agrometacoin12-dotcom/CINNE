import { FundingService } from './funding.service';
import { CommerceService } from '../commerce/commerce.service';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AppleCoinsService } from './apple-coins.service';
import { WalletService } from './wallet.service';

const url = process.env.FUNDING_TEST_DATABASE_URL;
(url ? describe : describe.skip)('Apple wallet settlement (isolated Postgres)', () => {
  let prisma: PrismaService;
  let userId: string;
  let service: AppleCoinsService;
  let wallet: WalletService;
  let txId: string;
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@fixture.test`, status: 'ACTIVE' } });
    userId = user.id;
    wallet = new WalletService(prisma, {} as never, {} as never, {} as never, {} as never, { get: () => undefined } as never);
    service = new AppleCoinsService(prisma, { verifyCoinTransaction: async () => ({
      transactionId: txId, productId: 'com.cinnetemple.coins.1000', type: 'Consumable',
      quantity: 1, appAccountToken: userId, environment: 'Sandbox',
    }) } as never, wallet, { get: () => 'test' } as never);
  });
  afterAll(async () => { await prisma?.$disconnect(); });
  it('twelve concurrent callbacks credit one pack and one ledger entry', async () => {
    txId = randomUUID();
    await Promise.all(Array.from({ length: 12 }, () => service.confirm(userId, 'fixture')));
    expect((await prisma.coinWallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(1000);
    expect(await prisma.coinLedgerEntry.count({ where: { userId } })).toBe(1);
    expect(await prisma.coinTopup.count({ where: { userId } })).toBe(1);
  });
  it('rolls back the top-up if ledger credit fails, allowing a later retry', async () => {
    txId = randomUUID();
    const apply = jest.spyOn(wallet, 'apply').mockRejectedValueOnce(new Error('simulated database failure'));
    await expect(service.confirm(userId, 'fixture')).rejects.toThrow('simulated database failure');
    expect(await prisma.coinTopup.count({ where: { reference: `apple_coin_${txId}` } })).toBe(0);
    apply.mockRestore();
    await service.confirm(userId, 'fixture');
    expect((await prisma.coinWallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(2000);
  });
  it('concurrent ticket requests spend coins once and create one entitlement', async () => {
    const titleId = randomUUID();
    const commerce = new CommerceService(prisma, { findRaw: async () => ({
      id: titleId, title: 'Fixture movie', status: 'published', priceMinor: 50000, currency: 'NGN',
    }) } as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, { get: () => undefined } as never, wallet);
    const before = (await prisma.coinWallet.findUniqueOrThrow({ where: { userId } })).balance;
    await Promise.all(Array.from({ length: 8 }, () => commerce.purchaseWithCoins(userId, titleId, randomUUID())));
    expect((await prisma.coinWallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(before - 500);
    expect(await prisma.entitlement.count({ where: { userId, titleId } })).toBe(1);
    expect(await prisma.purchase.count({ where: { userId, titleId } })).toBe(1);
  });
  it('insufficient coins roll back the purchase and entitlement', async () => {
    const titleId = randomUUID();
    const commerce = new CommerceService(prisma, { findRaw: async () => ({
      id: titleId, title: 'Fixture movie', status: 'published', priceMinor: 99999900, currency: 'NGN',
    }) } as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, { get: () => undefined } as never, wallet);
    await expect(commerce.purchaseWithCoins(userId, titleId, randomUUID())).rejects.toThrow('Not enough coins');
    expect(await prisma.purchase.count({ where: { userId, titleId } })).toBe(0);
    expect(await prisma.entitlement.count({ where: { userId, titleId } })).toBe(0);
  });

  it('uses one balance for Apple coins, film contributions, returns and tickets', async () => {
    const before = (await prisma.coinWallet.findUniqueOrThrow({ where: { userId } })).balance;
    txId = randomUUID();
    await service.confirm(userId, 'fixture');
    const funding = new FundingService(prisma, wallet,
      { record: async () => undefined } as never, { publish: async () => undefined } as never);
    const pool = await funding.create(userId, { name: 'Shared-wallet fixture', goalCoins: 500 });
    await funding.contribute(userId, pool.id, 500, randomUUID());
    await funding.close(userId, pool.id);
    await funding.payout(userId, pool.id, 600);
    const titleId = randomUUID();
    const commerce = new CommerceService(prisma, { findRaw: async () => ({
      id: titleId, title: 'Fixture movie', status: 'published', priceMinor: 50000, currency: 'NGN',
    }) } as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, { get: () => undefined } as never, wallet);
    await commerce.purchaseWithCoins(userId, titleId, randomUUID());
    const balance = (await prisma.coinWallet.findUniqueOrThrow({ where: { userId } })).balance;
    expect(balance).toBe(before + 1000 - 500 + 600 - 500);
    const ledger = await prisma.coinLedgerEntry.aggregate({ where: { userId }, _sum: { delta: true } });
    expect(ledger._sum.delta).toBe(balance);
  });

});
