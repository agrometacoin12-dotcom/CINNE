import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AppleCoinsService } from './apple-coins.service';
import { AppleNotificationsService } from './apple-notifications.service';
import { WalletService } from './wallet.service';
import { CommerceService } from '../commerce/commerce.service';

const url = process.env.FUNDING_TEST_DATABASE_URL;
(url ? describe : describe.skip)('Apple refunds against PostgreSQL', () => {
  let prisma: PrismaService;
  let wallet: WalletService;
  let coins: AppleCoinsService;
  let notifications: AppleNotificationsService;
  let userId: string;
  let transactionId: string;
  const config = { get: (key: string) => key === 'env' ? 'production' : undefined } as any;
  const signedTransaction = (extra = {}) => JSON.stringify({ transactionId, appAccountToken: userId,
    environment: 'Production', type: 'Consumable', quantity: 1,
    productId: 'com.cinnetemple.coins.500', ...extra });
  const event = (type = 'REFUND', signedDate = 1000, extra = {}) => JSON.stringify({
    notificationUUID: randomUUID(), notificationType: type, signedDate,
    data: { signedTransactionInfo: signedTransaction(type === 'REFUND' ? { revocationDate: signedDate } : {}) }, ...extra });
  const balance = async () => {
    const w = await prisma.coinWallet.findUnique({ where: { userId } });
    return (w?.balance ?? 0) - (w?.refundDebt ?? 0);
  };
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService(); await prisma.$connect();
    wallet = new WalletService(prisma, {} as any, {} as any, {} as any, {} as any, config);
    const verifier = { verifyCoinTransaction: async (v: string) => JSON.parse(v),
      verifyNotification: async (v: string) => JSON.parse(v) } as any;
    coins = new AppleCoinsService(prisma, verifier, wallet, config);
    notifications = new AppleNotificationsService(prisma, verifier, wallet, config);
  });
  beforeEach(async () => {
    userId = (await prisma.user.create({ data: { email: `${randomUUID()}@fixture.test`, status: 'ACTIVE' } })).id;
    transactionId = randomUUID();
  });
  afterAll(async () => { await prisma.$disconnect(); });
  it('applies concurrent duplicate refunds once and keeps a balanced ledger', async () => {
    await coins.confirm(userId, signedTransaction());
    const payload = event();
    await Promise.all(Array.from({ length: 12 }, () => notifications.receive(payload)));
    expect(await balance()).toBe(0);
    expect(await prisma.coinLedgerEntry.count({ where: { userId, kind: 'APPLE_REFUND' } })).toBe(1);
    const entries = await prisma.coinLedgerEntry.findMany({ where: { userId } });
    expect(entries.reduce((sum, row) => sum + row.delta, 0)).toBe(await balance());
  });
  it('records a refund before settlement and rejects a stale unrevoked purchase', async () => {
    await notifications.receive(event());
    await expect(coins.confirm(userId, signedTransaction())).rejects.toThrow('refunded');
    expect(await balance()).toBe(0);
    expect(await prisma.coinTopup.count({ where: { userId } })).toBe(0);
  });
  it('serializes settlement racing a refund without retaining refunded coins', async () => {
    await Promise.allSettled([coins.confirm(userId, signedTransaction()), notifications.receive(event())]);
    expect(await balance()).toBe(0);
    await expect(coins.confirm(userId, signedTransaction())).rejects.toThrow('refunded');
  });
  it('carries a spent refund as debt, prevents spending, and offsets later credits', async () => {
    await coins.confirm(userId, signedTransaction());
    await prisma.$transaction(tx => wallet.apply(tx, { userId, kind: 'TRANSFER_OUT', delta: -400, idempotencyKey: randomUUID() }));
    await notifications.receive(event());
    expect(await balance()).toBe(-400);
    await expect(prisma.$transaction(tx => wallet.apply(tx, { userId, kind: 'TRANSFER_OUT', delta: -1, idempotencyKey: randomUUID() }))).rejects.toThrow('Not enough coins');
    transactionId = randomUUID();
    await coins.confirm(userId, signedTransaction());
    expect(await balance()).toBe(100);
  });
  it('restores a reversed refund once and ignores older events', async () => {
    await coins.confirm(userId, signedTransaction());
    await notifications.receive(event());
    const reverse = event('REFUND_REVERSED', 2000);
    await notifications.receive(reverse); await notifications.receive(reverse);
    await notifications.receive(event('REFUND', 1500));
    expect(await balance()).toBe(500);
    expect(await prisma.coinLedgerEntry.count({ where: { userId, kind: 'APPLE_REFUND_REVERSAL' } })).toBe(1);
    await coins.confirm(userId, signedTransaction());
    expect(await balance()).toBe(500);
  });
  it('a reversal received first prevents an older refund from removing coins', async () => {
    await notifications.receive(event('REFUND_REVERSED', 2000));
    await coins.confirm(userId, signedTransaction());
    await notifications.receive(event('REFUND', 1000));
    expect(await balance()).toBe(500);
  });
  it('rolls back marker and ledger together and safely retries after failure', async () => {
    await coins.confirm(userId, signedTransaction());
    const payload = event();
    const apply = jest.spyOn(wallet, 'apply').mockRejectedValueOnce(new Error('database failure'));
    await expect(notifications.receive(payload)).rejects.toThrow('database failure');
    expect(await balance()).toBe(500);
    expect(await prisma.appleCoinRefundState.findUnique({ where: { transactionId } })).toBeNull();
    apply.mockRestore(); await notifications.receive(payload);
    expect(await balance()).toBe(0);
  });
  it('rejects mismatched ownership and unknown environments', async () => {
    await coins.confirm(userId, signedTransaction());
    for (const extra of [{ appAccountToken: randomUUID() }, { environment: 'Xcode' }]) {
      await expect(notifications.receive(event('REFUND', 1000, { data: {
        signedTransactionInfo: signedTransaction({ revocationDate: 1000, ...extra }),
      } }))).rejects.toThrow();
    }
    expect(await balance()).toBe(500);
  });
  it('settles sandbox purchases once without touching spendable money', async () => {
    const receipt = signedTransaction({ environment: 'Sandbox' });
    await Promise.all(Array.from({ length: 8 }, () => coins.confirm(userId, receipt)));
    expect(await coins.sandboxSummary(userId)).toEqual({ balance: 500, environment: 'Sandbox' });
    expect(await balance()).toBe(0);
    expect(await prisma.coinTopup.count({ where: { userId } })).toBe(0);
    expect(await prisma.coinLedgerEntry.count({ where: { userId } })).toBe(0);
  });
  it('refunds and reverses sandbox transactions only in the sandbox ledger', async () => {
    await coins.confirm(userId, signedTransaction({ environment: 'Sandbox' }));
    const refund = event('REFUND', 1000, { data: { signedTransactionInfo: signedTransaction({ environment: 'Sandbox', revocationDate: 1000 }) } });
    await notifications.receive(refund); await notifications.receive(refund);
    expect((await coins.sandboxSummary(userId)).balance).toBe(0);
    await notifications.receive(event('REFUND_REVERSED', 2000, { data: { signedTransactionInfo: signedTransaction({ environment: 'Sandbox' }) } }));
    expect((await coins.sandboxSummary(userId)).balance).toBe(500);
    expect(await balance()).toBe(0);
  });
  it('can exercise a sandbox ticket once without monetary revenue or real-wallet credit', async () => {
    await coins.confirm(userId, signedTransaction({ environment: 'Sandbox' }));
    const titleId = randomUUID();
    const commerce = new CommerceService(prisma, { findRaw: async () => ({ id: titleId,
      title: 'Sandbox review fixture', status: 'published', priceMinor: 50000, currency: 'NGN' }) } as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, config, wallet);
    await Promise.all(Array.from({ length: 8 }, () => commerce.purchaseWithSandboxCoins(userId, titleId, randomUUID())));
    expect((await coins.sandboxSummary(userId)).balance).toBe(0);
    expect(await balance()).toBe(0);
    const purchases = await prisma.purchase.findMany({ where: { userId } });
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ provider: 'MOCK', amountMinor: 0 });
    const e = await prisma.entitlement.findFirstOrThrow({ where: { userId } });
    expect(e.expiresAt).not.toBeNull();
    await expect(commerce.purchaseWithSandboxCoins(userId, randomUUID(), randomUUID())).rejects.toThrow('Not enough sandbox coins');
  });
});
