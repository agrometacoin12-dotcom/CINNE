/**
 * Funding engine against a real Postgres (raw SQL, CHECK constraints, row locks).
 * Skipped unless FUNDING_TEST_DATABASE_URL points at a THROWAWAY, migrated DB —
 * it creates users and moves coins freely:
 *
 *   docker run -d --rm --name ct-funding-test -e POSTGRES_USER=ct -e POSTGRES_PASSWORD=ct \
 *     -e POSTGRES_DB=ct -p 127.0.0.1:55499:5432 postgres:16
 *   DATABASE_URL=postgresql://ct:ct@127.0.0.1:55499/ct pnpm prisma migrate deploy
 *   FUNDING_TEST_DATABASE_URL=postgresql://ct:ct@127.0.0.1:55499/ct pnpm jest funding.int
 */
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MockPaymentDriver } from '../commerce/drivers/mock-payment.driver';
import { UsersRepository } from '../users/users.repository';
import { FundingService } from './funding.service';
import { WalletService } from './wallet.service';

const url = process.env.FUNDING_TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('funding engine (Postgres)', () => {
  let prisma: PrismaService;
  let wallet: WalletService;
  let funding: FundingService;
  const ids: Record<string, string> = {};
  const emails: Record<string, string> = {};
  const key = () => randomUUID();

  const balance = async (u: string) =>
    (await prisma.coinWallet.findUnique({ where: { userId: ids[u]! } }))?.balance ?? 0;
  const buyer = (u: string) => ({ sub: ids[u]!, email: emails[u]! });
  const topUp = async (u: string, coins: number) => {
    const t = await wallet.startTopup(buyer(u), coins);
    await wallet.verifyTopup(ids[u]!, t.reference);
    return t.reference;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    const audit = { record: async () => undefined } as never;
    const events = { publish: async () => undefined } as never;
    const config = { get: () => 'https://cinnetemple.com' } as never;
    wallet = new WalletService(
      prisma,
      new UsersRepository(prisma),
      audit,
      events,
      new MockPaymentDriver('https://cinnetemple.com'),
      config,
    );
    funding = new FundingService(prisma, wallet, audit, events);
    const tag = randomUUID().slice(0, 8);
    for (const u of ['ada', 'bayo', 'chi', 'admin']) {
      emails[u] = `${u}.${tag}@test.cinnetemple.com`;
      const row = await prisma.user.create({
        data: { email: emails[u]!, status: 'ACTIVE', emailVerified: true },
      });
      ids[u] = row.id;
    }
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('credits a top-up exactly once across verify, re-verify and webhook', async () => {
    const ref = await topUp('ada', 50_000);
    await wallet.verifyTopup(ids.ada!, ref);
    await wallet.settleTopupFromWebhook(ref, 5_000_000, 'NGN');
    expect(await balance('ada')).toBe(50_000);
  });

  it('refuses a webhook whose amount disagrees with the top-up', async () => {
    const t = await wallet.startTopup(buyer('chi'), 1_000);
    await expect(wallet.settleTopupFromWebhook(t.reference, 100, 'NGN')).rejects.toThrow(
      /mismatch/,
    );
    expect(await balance('chi')).toBe(0);
  });

  it('sends coins once per idempotency key', async () => {
    const k = key();
    const input = { recipientEmail: emails.bayo!, coins: 10_000, idempotencyKey: k };
    await Promise.all([wallet.transfer(buyer('ada'), input), wallet.transfer(buyer('ada'), input)]);
    expect(await balance('ada')).toBe(40_000);
    expect(await balance('bayo')).toBe(10_000);
  });

  it('never overdraws under concurrent spends', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        wallet.transfer(buyer('ada'), {
          recipientEmail: emails.chi!,
          coins: 5_000,
          idempotencyKey: key(),
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(8);
    expect(await balance('ada')).toBe(0);
    expect(await balance('chi')).toBe(40_000);
  });

  it('funds a pool, caps at the goal, refunds in coins, then pays out per coin', async () => {
    const pool = await funding.create(ids.admin!, { name: 'Eko Nights', goalCoins: 100_000 });
    await topUp('ada', 60_000);

    await funding.contribute(ids.ada!, pool.id, 60_000, key());
    await funding.contribute(ids.bayo!, pool.id, 10_000, key());
    await funding.contribute(ids.chi!, pool.id, 30_000, key());
    await expect(funding.contribute(ids.chi!, pool.id, 1, key())).rejects.toThrow(/goal/);

    // Refund claim: bayo's stake returns as coins; a second claim finds nothing.
    const refund = await funding.claimRefund(ids.bayo!, pool.id);
    expect(refund.refundedCoins).toBe(10_000);
    expect(await balance('bayo')).toBe(10_000);
    await expect(funding.claimRefund(ids.bayo!, pool.id)).rejects.toThrow(/no coins/);

    // ₦135,000 over 90,000 pooled coins → ₦1.5 per coin.
    const preview = await funding.previewPayout(pool.id, 135_000);
    expect(preview.nairaPerCoin).toBe('1.5000');
    const paid = await funding.payout(ids.admin!, pool.id, 135_000);
    expect(paid.backers.reduce((s, b) => s + b.payoutCoins, 0)).toBe(135_000);
    expect(await balance('ada')).toBe(90_000);
    expect(await balance('chi')).toBe(10_000 + 45_000);

    await expect(funding.payout(ids.admin!, pool.id, 1)).rejects.toThrow(/settled/);
    await expect(funding.claimRefund(ids.chi!, pool.id)).rejects.toThrow();
    const view = await funding.getPublic(pool.id, ids.ada!);
    expect(view.status).toBe('PAID_OUT');
    expect(view.backers).toBe(2);
    expect(view.myStake?.payoutCoins).toBe(90_000);
  });

  it('cancelling a pool refunds every backer in coins', async () => {
    const pool = await funding.create(ids.admin!, { name: 'Lagos Ferry' });
    await funding.contribute(ids.ada!, pool.id, 20_000, key());
    await funding.contribute(ids.chi!, pool.id, 5_000, key());
    const res = await funding.cancel(ids.admin!, pool.id);
    expect(res.refundedCoins).toBe(25_000);
    expect(await balance('ada')).toBe(90_000);
    expect(await balance('chi')).toBe(55_000);
    await expect(funding.contribute(ids.ada!, pool.id, 1, key())).rejects.toThrow(/no longer/);
  });

  it('a double-tapped refund claim pays out once', async () => {
    const pool = await funding.create(ids.admin!, { name: 'Double Tap' });
    await funding.contribute(ids.chi!, pool.id, 5_000, key());
    const before = await balance('chi');
    const results = await Promise.allSettled([
      funding.claimRefund(ids.chi!, pool.id),
      funding.claimRefund(ids.chi!, pool.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balance('chi')).toBe(before + 5_000);
  });

  it('funding racing a payout either lands before it (and is paid) or is rejected', async () => {
    const pool = await funding.create(ids.admin!, { name: 'Race Day' });
    await funding.contribute(ids.ada!, pool.id, 10_000, key());
    const [, late] = await Promise.allSettled([
      funding.payout(ids.admin!, pool.id, 20_000),
      funding.contribute(ids.chi!, pool.id, 10_000, key()),
    ]);
    const settled = await prisma.fundingPool.findUniqueOrThrow({ where: { id: pool.id } });
    const stakes = await prisma.poolContribution.findMany({ where: { poolId: pool.id } });
    expect(settled.totalCoins).toBe(stakes.reduce((s, c) => s + c.coins - c.refundedCoins, 0));
    expect(stakes.reduce((s, c) => s + (c.payoutCoins ?? 0), 0)).toBe(20_000);
    if (late.status === 'fulfilled') expect(stakes).toHaveLength(2);
  });

  it('the ledger always sums to each wallet balance', async () => {
    for (const u of ['ada', 'bayo', 'chi']) {
      const agg = await prisma.coinLedgerEntry.aggregate({
        where: { userId: ids[u]! },
        _sum: { delta: true },
      });
      expect(agg._sum.delta ?? 0).toBe(await balance(u));
    }
  });

  it('the database rejects a negative balance even if the service is bypassed', async () => {
    await expect(
      prisma.coinWallet.update({ where: { userId: ids.bayo! }, data: { balance: -1 } }),
    ).rejects.toThrow();
  });
});
