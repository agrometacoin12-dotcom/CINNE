import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CommerceService } from './commerce.service';
import { AppleIapVerifier } from './drivers/apple-iap.verifier';

const BUYER = { sub: '11111111-1111-1111-1111-111111111111', email: 'buyer@test.com' };
const TITLE_ID = '22222222-2222-2222-2222-222222222222';

const publishedTitle = {
  id: TITLE_ID,
  title: 'The Fisherman & The King',
  status: 'published',
  priceMinor: 250_000,
  currency: 'NGN',
} as never;

/** base64url without padding, matching StoreKit's JWS segments. */
function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** A structurally-valid StoreKit JWS whose signature/x5c are bogus. */
function forgedTransaction(claims: Record<string, unknown>): string {
  return `${b64url({ alg: 'ES256' })}.${b64url(claims)}.Zm9yZ2Vk`;
}

function configStub(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

/** A real verifier (real Apple root CAs) configured for a bundle id. */
function realVerifier(bundleId = 'com.cinnetemple.app'): AppleIapVerifier {
  return new AppleIapVerifier(
    configStub({ appleBundleId: bundleId, appleIapEnvironment: 'Sandbox' }),
  );
}

/** A verifier subclass whose underlying library verifier is stubbed to succeed. */
class StubbedVerifier extends AppleIapVerifier {
  constructor(private readonly decoded: Record<string, unknown>) {
    super(configStub({ appleBundleId: 'com.cinnetemple.app', appleIapEnvironment: 'Sandbox' }));
  }
  protected override buildVerifier(): never {
    return {
      verifyAndDecodeTransaction: async () => this.decoded,
    } as never;
  }
}

interface Mocks {
  purchaseCreate: jest.Mock;
  purchaseUpdate: jest.Mock;
  entitlementUpsert: jest.Mock;
  grant: jest.Mock;
  verify: jest.Mock;
  findPurchase: jest.Mock;
}

function makeService(
  verifier: AppleIapVerifier,
  overrides: {
    existingPurchase?: unknown;
    verifyResult?: { status: string; amountMinor?: number; currency?: string };
    storedPurchase?: unknown;
  } = {},
): { service: CommerceService; mocks: Mocks } {
  const purchaseCreate = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'purchase-1',
    ...data,
  }));
  const purchaseUpdate = jest.fn(async () => ({}));
  const entitlementUpsert = jest.fn(async () => ({}));
  const findPurchase = jest.fn(async () => overrides.existingPurchase ?? null);
  const prisma = {
    purchase: {
      findUnique: findPurchase,
      create: purchaseCreate,
      update: purchaseUpdate,
    },
    entitlement: { upsert: entitlementUpsert },
    $transaction: jest.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  } as never;

  const catalogue = { findRaw: jest.fn(async () => publishedTitle) } as never;
  const users = {} as never;
  const grant = jest.fn(async () => undefined);
  const entitlements = { grant } as never;
  const audit = { record: jest.fn(async () => undefined) } as never;
  const events = { publish: jest.fn(async () => undefined) } as never;
  const verify = jest.fn(async () => overrides.verifyResult ?? { status: 'paid' });
  const payment = { provider: 'PAYSTACK', verify } as never;
  const config = configStub({ webBaseUrl: 'https://cinnetemple.com' });

  const service = new CommerceService(
    prisma,
    catalogue,
    users,
    entitlements,
    audit,
    events,
    verifier,
    payment,
    config,
  );
  return {
    service,
    mocks: { purchaseCreate, purchaseUpdate, entitlementUpsert, grant, verify, findPurchase },
  };
}

describe('CommerceService.confirmApple — StoreKit verification (CT-01)', () => {
  it('rejects a forged transaction (valid structure, bad signature) with 401', async () => {
    const { service, mocks } = makeService(realVerifier());
    const dto = {
      titleId: TITLE_ID,
      transactionId: 'forged-tx-1',
      signedTransaction: forgedTransaction({
        bundleId: 'com.cinnetemple.app',
        transactionId: 'forged-tx-1',
        productId: 'anything',
      }),
    };
    await expect(service.confirmApple(BUYER, dto)).rejects.toBeInstanceOf(UnauthorizedException);
    // Nothing was granted.
    expect(mocks.purchaseCreate).not.toHaveBeenCalled();
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it('rejects arbitrary / non-JWS signedTransaction strings with 401', async () => {
    const { service } = makeService(realVerifier());
    await expect(
      service.confirmApple(BUYER, {
        titleId: TITLE_ID,
        transactionId: 'x',
        signedTransaction: 'not-a-jws',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed with 503 when the Apple bundle id is not configured', async () => {
    const { service, mocks } = makeService(realVerifier(''));
    await expect(
      service.confirmApple(BUYER, {
        titleId: TITLE_ID,
        transactionId: 'tx-1',
        signedTransaction: forgedTransaction({ transactionId: 'tx-1' }),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mocks.purchaseCreate).not.toHaveBeenCalled();
    expect(mocks.grant).not.toHaveBeenCalled();
  });

  it('grants an entitlement for a genuinely-verified transaction', async () => {
    const verifier = new StubbedVerifier({
      bundleId: 'com.cinnetemple.app',
      transactionId: 'genuine-tx-9',
      productId: 'com.cinnetemple.movie',
    });
    const { service, mocks } = makeService(verifier);
    const result = await service.confirmApple(BUYER, {
      titleId: TITLE_ID,
      transactionId: 'genuine-tx-9',
      signedTransaction: 'ignored-because-verifier-is-stubbed',
    });
    expect(result).toEqual({ status: 'paid', titleId: TITLE_ID });
    expect(mocks.purchaseCreate).toHaveBeenCalledTimes(1);
    // providerRef is derived from the VERIFIED transaction id, not the client's.
    expect(mocks.purchaseCreate.mock.calls[0][0].data.providerRef).toBe('apple_genuine-tx-9');
    expect(mocks.grant).toHaveBeenCalledWith(BUYER.sub, TITLE_ID, 'purchase-1');
  });

  it('rejects a verified transaction whose id disagrees with the client claim (400)', async () => {
    const verifier = new StubbedVerifier({
      bundleId: 'com.cinnetemple.app',
      transactionId: 'verified-tx',
    });
    const { service, mocks } = makeService(verifier);
    await expect(
      service.confirmApple(BUYER, {
        titleId: TITLE_ID,
        transactionId: 'client-claimed-different',
        signedTransaction: 'stubbed',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.purchaseCreate).not.toHaveBeenCalled();
  });
});

describe('CommerceService.verify — settlement reconciliation (CT-03)', () => {
  const stored = {
    id: 'purchase-1',
    providerRef: 'ct_ref',
    titleId: TITLE_ID,
    status: 'PENDING',
    amountMinor: 250_000,
    currency: 'NGN',
    beneficiaryUserId: BUYER.sub,
    isGift: false,
  };

  it('does NOT mark paid when the provider-reported amount mismatches', async () => {
    const { service, mocks } = makeService(realVerifier(), {
      existingPurchase: stored,
      verifyResult: { status: 'paid', amountMinor: 100, currency: 'NGN' },
    });
    await expect(service.verify('ct_ref')).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.purchaseUpdate).not.toHaveBeenCalled();
    expect(mocks.entitlementUpsert).not.toHaveBeenCalled();
  });

  it('does NOT mark paid when the provider-reported currency mismatches', async () => {
    const { service, mocks } = makeService(realVerifier(), {
      existingPurchase: stored,
      verifyResult: { status: 'paid', amountMinor: 250_000, currency: 'USD' },
    });
    await expect(service.verify('ct_ref')).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.entitlementUpsert).not.toHaveBeenCalled();
  });

  it('marks paid when the provider-reported amount and currency reconcile', async () => {
    const { service, mocks } = makeService(realVerifier(), {
      existingPurchase: stored,
      verifyResult: { status: 'paid', amountMinor: 250_000, currency: 'NGN' },
    });
    const result = await service.verify('ct_ref');
    expect(result).toEqual({ status: 'paid', titleId: TITLE_ID });
    expect(mocks.entitlementUpsert).toHaveBeenCalledTimes(1);
  });
});
