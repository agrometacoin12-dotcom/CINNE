import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { GooglePlayCoinsService, googlePlayAccountId } from './google-play-coins.service';

const userId = '11111111-1111-4111-8111-111111111111';
const productId = 'com.cinnetemple.coins.500';
const purchaseToken = 'verified-google-purchase-token';

function setup(overrides: Record<string, unknown> = {}) {
  let stored: any = null;
  let balance = 0;
  const apply = jest.fn(async (_tx, write) => {
    balance += write.delta;
    return balance;
  });
  const prisma: any = {
    coinTopup: {
      findUnique: jest.fn(async () => stored),
      create: jest.fn(async ({ data }) => {
        stored = data;
        return stored;
      }),
    },
    coinWallet: { findUnique: jest.fn(async () => ({ balance })) },
    $transaction: jest.fn(async (fn) => fn(prisma)),
  };
  const verifier: any = {
    isConfigured: jest.fn(() => true),
    verifyPurchase: jest.fn(async () => ({
      productId,
      purchaseState: 0,
      consumptionState: 0,
      quantity: 1,
      obfuscatedExternalAccountId: googlePlayAccountId(userId),
      ...overrides,
    })),
    consume: jest.fn(async () => undefined),
  };
  const config: any = { get: (key: string) => (key === 'env' ? 'test' : undefined) };
  return {
    service: new GooglePlayCoinsService(prisma, verifier, { apply } as any, config),
    prisma,
    verifier,
    apply,
  };
}

describe('Google Play coin wallet', () => {
  it('credits and consumes a verified pack exactly once', async () => {
    const { service, verifier, apply } = setup();
    verifier.verifyPurchase
      .mockResolvedValueOnce({
        productId,
        purchaseState: 0,
        consumptionState: 0,
        quantity: 1,
        obfuscatedExternalAccountId: googlePlayAccountId(userId),
      })
      .mockResolvedValueOnce({
        productId,
        purchaseState: 0,
        consumptionState: 1,
        quantity: 1,
        obfuscatedExternalAccountId: googlePlayAccountId(userId),
      });
    await expect(service.confirm(userId, productId, purchaseToken)).resolves.toEqual({
      status: 'paid',
      coins: 500,
      balance: 500,
    });
    await expect(service.confirm(userId, productId, purchaseToken)).resolves.toEqual({
      status: 'paid',
      coins: 500,
      balance: 500,
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(verifier.consume).toHaveBeenCalledTimes(1);
  });

  it('retries consumption without double-crediting after a transient failure', async () => {
    const { service, verifier, apply } = setup();
    verifier.consume.mockRejectedValueOnce(new ServiceUnavailableException());
    await expect(service.confirm(userId, productId, purchaseToken)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.confirm(userId, productId, purchaseToken)).resolves.toMatchObject({
      balance: 500,
    });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(verifier.consume).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ purchaseState: 1 }, BadRequestException],
    [{ quantity: 2 }, BadRequestException],
    [{ productId: 'com.cinnetemple.coins.1000' }, BadRequestException],
    [{ obfuscatedExternalAccountId: 'wrong-account' }, UnauthorizedException],
  ])('rejects invalid verified claims %j', async (claims, expected) => {
    const { service, apply } = setup(claims);
    await expect(service.confirm(userId, productId, purchaseToken)).rejects.toBeInstanceOf(
      expected,
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it('blocks free license-test purchases from production wallets', async () => {
    const { prisma, verifier, apply } = setup({ purchaseType: 0 });
    const service = new GooglePlayCoinsService(
      prisma,
      verifier,
      { apply } as any,
      {
        get: (key: string) => (key === 'env' ? 'production' : undefined),
      } as any,
    );
    await expect(service.confirm(userId, productId, purchaseToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it('fails closed when Google Play is not configured', () => {
    const { prisma, verifier, apply } = setup();
    verifier.isConfigured.mockReturnValue(false);
    const service = new GooglePlayCoinsService(
      prisma,
      verifier,
      { apply } as any,
      {
        get: () => undefined,
      } as any,
    );
    expect(() => service.products()).toThrow(ServiceUnavailableException);
  });
});
