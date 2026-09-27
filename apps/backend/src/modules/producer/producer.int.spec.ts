/**
 * Producer links, views, earnings and withdrawals against a real Postgres.
 * Skipped unless FUNDING_TEST_DATABASE_URL points at a THROWAWAY migrated DB
 * (same setup as funding.int.spec.ts).
 */
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ProducerService } from './producer.service';

const url = process.env.FUNDING_TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('producer dashboard (Postgres)', () => {
  let prisma: PrismaService;
  let service: ProducerService;
  const sent: { to: string; subject: string; body: string }[] = [];
  const film = randomUUID();
  const series = randomUUID();
  const email = `producer.${randomUUID().slice(0, 8)}@test.cinnetemple.com`;
  let viewer: string;

  const ADMIN = randomUUID();
  const lastKey = () =>
    sent
      .filter((m) => m.to === email && m.body.includes('#key='))
      .at(-1)!
      .body.match(/#key=([\w-]+)/)![1]!;
  const lastCode = () =>
    sent
      .filter((m) => m.to === email)
      .at(-1)!
      .subject.match(/(\d{6})$/)![1]!;
  const producer = async () => (await service.authenticate(lastKey()))!;

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    prisma = new PrismaService();
    await prisma.$connect();
    const titles: Record<string, { id: string; title: string; type: string }> = {
      [film]: { id: film, title: 'Danfo Diaries', type: 'movie' },
      [series]: { id: series, title: 'Eko Nights', type: 'series' },
    };
    const catalogue = {
      findRaw: async (id: string) => titles[id] ?? null,
      summaryFor: async (id: string) => ({ ...titles[id], year: 2026, posterUrl: null }),
    } as never;
    const mail = {
      sendPlain: async (to: string, subject: string, body: string) =>
        void sent.push({ to, subject, body }),
    } as never;
    const audit = { record: async () => undefined } as never;
    const config = {
      get: (k: string) => (k === 'appleCommissionBps' ? 3_000 : 'https://cinnetemple.com'),
    } as never;
    service = new ProducerService(prisma, catalogue, mail, audit, config);

    viewer = (
      await prisma.user.create({ data: { email: `v.${randomUUID()}@t.co`, status: 'ACTIVE' } })
    ).id;
    // 4 Paystack tickets at ₦2,500 and 1 Apple ticket at ₦2,500 for the film,
    // 1 refunded ticket (must not count). 3 of the tickets were started (views).
    const sales = [
      ...Array.from({ length: 4 }, () => ({
        provider: 'PAYSTACK' as const,
        status: 'PAID' as const,
      })),
      { provider: 'APPLE_IAP' as const, status: 'PAID' as const },
      { provider: 'PAYSTACK' as const, status: 'REFUNDED' as const },
    ];
    for (const [i, s] of sales.entries()) {
      const p = await prisma.purchase.create({
        data: {
          userId: viewer,
          beneficiaryUserId: viewer,
          titleId: film,
          titleName: 'Danfo Diaries',
          amountMinor: 250_000,
          provider: s.provider,
          providerRef: `t_${randomUUID()}`,
          status: s.status,
        },
      });
      if (s.status === 'PAID') {
        await prisma.entitlement.create({
          data: {
            userId: viewer,
            titleId: film,
            purchaseId: p.id,
            startedAt: i < 3 ? new Date() : null,
            status: i === 0 ? 'CONSUMED' : 'ACTIVE',
          },
        });
      }
    }
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('assigns a producer and emails a private link (key only in the fragment)', async () => {
    const res = await service.assign(ADMIN, film, { email: email.toUpperCase(), name: 'Kunle' });
    expect(res?.email).toBe(email);
    expect(res?.revenueShareBps).toBe(9_000);
    expect(sent.at(-1)!.body).toMatch(/https:\/\/cinnetemple\.com\/producer#key=/);
    const row = await prisma.producer.findUniqueOrThrow({ where: { email } });
    expect(row.keyHash).not.toContain(lastKey()); // only the hash is stored
  });

  it('rotating the link invalidates the old one', async () => {
    const old = lastKey();
    await service.resendLink(ADMIN, film);
    expect(await service.authenticate(old)).toBeNull();
    expect(await service.authenticate(lastKey())).not.toBeNull();
  });

  it('adds a second title to the same producer', async () => {
    await service.assign(ADMIN, series, { email, revenueShareBps: 8_000 });
    const d = await service.dashboard(await producer());
    expect(d.films.map((f) => f.title)).toEqual(['Danfo Diaries', 'Eko Nights']);
  });

  it('reports views, tickets and 90% earnings (Apple net of its cut)', async () => {
    const d = await service.dashboard(await producer());
    const f = d.films.find((x) => x.titleId === film)!;
    expect(f.views).toBe(3);
    expect(f.completedViews).toBe(1);
    expect(f.ticketsSold).toBe(5);
    expect(f.grossMinor).toBe(1_250_000);
    // 4 × ₦2,250 + ₦1,575 = ₦10,575
    expect(f.earningsMinor).toBe(1_057_500);
    expect(d.balance.availableMinor).toBe(1_057_500);
    expect(d.dailyViews).toHaveLength(30);
    expect(d.dailyViews.at(-1)!.views).toBe(3);
  });

  it('withdrawal needs the emailed code; wrong codes count down', async () => {
    const p = await producer();
    const req = await service.requestWithdrawal(p, {
      amountNaira: 5_000,
      bankName: 'GTBank',
      accountNumber: '0123456789',
      accountName: 'Kunle Afolayan',
    });
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    await expect(service.confirmWithdrawal(p, req.id, wrong)).rejects.toThrow(/4 tries left/);
    const d = await service.confirmWithdrawal(p, req.id, code);
    expect(d.balance.requestedMinor).toBe(500_000);
    expect(d.balance.availableMinor).toBe(1_057_500 - 500_000);
    await expect(service.confirmWithdrawal(p, req.id, code)).rejects.toThrow(/no longer waiting/);
  });

  it('cannot overdraw, even with concurrent requests', async () => {
    const p = await producer();
    const ask = () =>
      service.requestWithdrawal(p, {
        amountNaira: 4_000,
        bankName: 'GTBank',
        accountNumber: '0123456789',
        accountName: 'Kunle Afolayan',
      });
    // ₦5,575 available: only one ₦4,000 hold fits.
    const results = await Promise.allSettled([ask(), ask(), ask()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/up to ₦1,575/);
  });

  it('admin pays or rejects; rejection returns the funds', async () => {
    const [queued] = await service.listWithdrawals('REQUESTED');
    const paid = await service.markPaid(ADMIN, queued!.id, 'PSK_TRF_123');
    expect(paid.status).toBe('PAID');
    expect(sent.at(-1)!.subject).toMatch(/has been paid/);
    await expect(service.reject(ADMIN, queued!.id, 'dup')).rejects.toThrow(/Only a requested/);

    const d = await service.dashboard(await producer());
    expect(d.balance.paidMinor).toBe(500_000);
    expect(d.withdrawals[0]!.transferRef).toBe('PSK_TRF_123');
  });
});
