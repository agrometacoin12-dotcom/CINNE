import { AppleCoinsService } from './apple-coins.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

const userId = '11111111-1111-4111-8111-111111111111';
const valid = { transactionId: '1234', productId: 'com.cinnetemple.coins.500',
  type: 'Consumable', quantity: 1, appAccountToken: userId };
function setup(overrides = {}) {
  let stored: any = null;
  let balance = 0;
  const apply = jest.fn(async (_tx, w) => { balance += w.delta; return balance; });
  const prisma: any = {
    $queryRaw: jest.fn(async () => []),
    appleCoinRefundState: { findUnique: jest.fn(async () => null) },
    coinTopup: {
      findUnique: jest.fn(async () => stored),
      create: jest.fn(async ({ data }) => { stored = data; return stored; }),
    },
    coinWallet: { findUnique: jest.fn(async () => ({ balance })) },
    $transaction: jest.fn(async fn => fn(prisma)),
  };
  const verifier: any = { verifyCoinTransaction: jest.fn(async () => ({ ...valid, ...overrides })) };
  return { service: new AppleCoinsService(prisma, verifier, { apply } as any, { get: () => undefined } as any), apply, prisma, verifier };
}
describe('Apple coin wallet', () => {
  it('credits exactly the server-listed pack and replays without extra credit', async () => {
    const { service, apply } = setup();
    expect(await service.confirm(userId, 'signed')).toEqual({ status: 'paid', coins: 500, balance: 500 });
    expect(await service.confirm(userId, 'signed')).toEqual({ status: 'paid', coins: 500, balance: 500 });
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it.each([
    { productId: 'com.cinnetemple.coins.999999' }, { type: 'Non-Consumable' },
    { quantity: 2 }, { revocationDate: Date.now() },
  ])('rejects invalid signed purchase claims %j', async claims => {
    const { service, apply } = setup(claims);
    await expect(service.confirm(userId, 'signed')).rejects.toBeInstanceOf(BadRequestException);
    expect(apply).not.toHaveBeenCalled();
  });
  it.each([undefined, '22222222-2222-4222-8222-222222222222'])('rejects missing/wrong account token', async token => {
    const { service, apply } = setup({ appAccountToken: token });
    await expect(service.confirm(userId, 'signed')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(apply).not.toHaveBeenCalled();
  });
  it.each([undefined, 'Xcode'])('blocks non-production environment %s from live wallets', async environment => {
    const { prisma, verifier, apply } = setup({ environment });
    const service = new AppleCoinsService(prisma, verifier, { apply } as any,
      { get: (key: string) => key === 'env' ? 'production' : undefined } as any);
    await expect(service.confirm(userId, 'signed')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(apply).not.toHaveBeenCalled();
  });
  it.each([500, 1000, 2500, 5000])('settles the %i coin production pack once', async coins => {
    const { prisma, verifier, apply } = setup({ environment: 'Production', productId: `com.cinnetemple.coins.${coins}` });
    const service = new AppleCoinsService(prisma, verifier, { apply } as any,
      { get: (key: string) => key === 'env' ? 'production' : undefined } as any);
    await expect(service.confirm(userId, 'signed')).resolves.toEqual({ status: 'paid', coins, balance: coins });
    await expect(service.confirm(userId, 'signed')).resolves.toEqual({ status: 'paid', coins, balance: coins });
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it('does not touch the wallet after signature verification fails', async () => {
    const { service, verifier, prisma } = setup();
    verifier.verifyCoinTransaction.mockRejectedValue(new UnauthorizedException());
    await expect(service.confirm(userId, 'forged')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('Shared test coin balance', () => {
  it('combines confirmed Apple and browser coins, subtracts tickets, and does not read live funds', async () => {
    const prisma: any = {
      appleSandboxCoinPurchase: { aggregate: jest.fn(async () => ({ _sum: { coins: 500 } })) },
      korapayTestTopup: { aggregate: jest.fn(async () => ({ _sum: { coins: 1000 } })) },
      appleSandboxCoinSpend: { aggregate: jest.fn(async () => ({ _sum: { coins: 400 } })) },
      coinWallet: { findUnique: jest.fn() },
    };
    const service = new AppleCoinsService(prisma, {} as any, {} as any, {} as any);
    await expect(service.sandboxSummary(userId)).resolves.toEqual({ balance: 1100, environment: 'Sandbox' });
    expect(prisma.appleSandboxCoinPurchase.aggregate).toHaveBeenCalledWith({
      where: { userId, confirmed: true, refunded: false }, _sum: { coins: true },
    });
    expect(prisma.korapayTestTopup.aggregate).toHaveBeenCalledWith({
      where: { userId, status: 'PAID' }, _sum: { coins: true },
    });
    expect(prisma.coinWallet.findUnique).not.toHaveBeenCalled();
  });
});
