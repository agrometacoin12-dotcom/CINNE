import { AdminService } from './admin.service';

describe('Admin live coin top-ups', () => {
  function fixture() {
    const row = { id: 'topup', reference: 'coin_live', coins: 500, amountMinor: 50000, currency: 'NGN', provider: 'PAYSTACK', status: 'PAID', createdAt: new Date('2026-10-26T12:32:25Z'), paidAt: new Date('2026-10-26T12:33:40Z'), user: { email: 'buyer@example.com', profile: { displayName: 'Buyer' }, passwordHash: 'never-return' } };
    const prisma = { coinTopup: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([row]) }, $transaction: (queries: Promise<unknown>[]) => Promise.all(queries) };
    const service = Object.assign(Object.create(AdminService.prototype), { prisma }) as AdminService;
    return { service, prisma };
  }
  it('returns paid live top-ups with buyer, coins and date without private user fields', async () => {
    const { service, prisma } = fixture();
    const result = await service.listCoinTopups({ q: 'buyer', status: 'PAID', take: 25, skip: 0 });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ coins: 500, amountMinor: 50000, userEmail: 'buyer@example.com', status: 'PAID', provider: 'PAYSTACK', paidAt: '2026-10-26T12:33:40.000Z' });
    expect(JSON.stringify(result)).not.toContain('never-return');
    const args = prisma.coinTopup.findMany.mock.calls[0][0];
    expect(args.where.provider).toEqual({ not: 'MOCK' });
    expect(args.where.status).toBe('PAID');
    expect(args.where.OR).toHaveLength(3);
    expect(prisma.coinTopup.count.mock.calls[0][0].where).toEqual(args.where);
  });
  it('rejects invalid statuses and bounds pagination', async () => {
    const { service, prisma } = fixture();
    await expect(service.listCoinTopups({ status: 'FAKE' })).rejects.toThrow('Invalid top-up status');
    expect(prisma.coinTopup.findMany).not.toHaveBeenCalled();
    await service.listCoinTopups({ take: 9999, skip: -2 });
    expect(prisma.coinTopup.findMany.mock.calls[0][0]).toMatchObject({ take: 200, skip: 0 });
  });
});
