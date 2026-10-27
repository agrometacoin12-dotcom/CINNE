import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AppleIapVerifier } from './apple-iap.verifier';

function verifier(overrides: Record<string, string> = {}) {
  return new AppleIapVerifier(new ConfigService({
    appleBundleId: 'CinneTemple.CinneTemple',
    appleAppAppleId: '6792485351',
    appleIapEnvironment: 'Production',
    ...overrides,
  }));
}

describe('Apple production transaction verification', () => {
  it('requires the App Store numeric app ID in production', async () => {
    const subject = verifier({ appleAppAppleId: '' });
    expect(subject.isConfigured()).toBe(false);
    await expect(subject.verifyTransaction('untrusted')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects forged transactions through the real Apple verifier before settlement', async () => {
    const subject = verifier();
    expect(subject.isConfigured()).toBe(true);
    const body = Buffer.from(JSON.stringify({
      transactionId: 'forged-transaction', bundleId: 'CinneTemple.CinneTemple',
      environment: 'Production', productId: 'com.cinnetemple.coins.5000',
    })).toString('base64url');
    await expect(subject.verifyTransaction(`eyJhbGciOiJFUzI1NiJ9.${body}.forged`))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects a forged outer notification before processing its nested payload', async () => {
    await expect(verifier().verifyNotification('forged-notification')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('Sandbox confirmation on the main service', () => {
  it('falls back to a separately verified sandbox transaction', async () => {
    const subject = verifier();
    jest.spyOn(subject, 'verifyTransaction').mockRejectedValue(new UnauthorizedException());
    const verifyAndDecodeTransaction = jest.fn().mockResolvedValue({transactionId:'sandbox-1', environment:'Sandbox'});
    jest.spyOn(subject as any, 'getSandboxVerifier').mockReturnValue({verifyAndDecodeTransaction});
    await expect(subject.verifyCoinTransaction('signed')).resolves.toMatchObject({transactionId:'sandbox-1',environment:'Sandbox'});
    expect(verifyAndDecodeTransaction).toHaveBeenCalledWith('signed');
  });
  it('does not bypass missing production configuration with sandbox fallback', async () => {
    const subject = verifier({appleAppAppleId:''});
    const sandbox = jest.spyOn(subject as any, 'getSandboxVerifier');
    await expect(subject.verifyCoinTransaction('signed')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(sandbox).not.toHaveBeenCalled();
  });
});
