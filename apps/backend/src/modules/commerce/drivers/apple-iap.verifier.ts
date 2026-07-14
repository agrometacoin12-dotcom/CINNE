import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Environment, SignedDataVerifier } from '@apple/app-store-server-library';
import { APPLE_ROOT_CERTIFICATES } from './apple-root-cas';

/** The subset of a verified StoreKit 2 transaction we act on. */
export interface VerifiedAppleTransaction {
  /** Apple's authoritative transaction id (never client-supplied). */
  transactionId: string;
  /** The purchased product identifier, as signed by Apple. */
  productId?: string;
  /** The app bundle id the transaction was signed for. */
  bundleId?: string;
}

/**
 * Cryptographically verifies StoreKit 2 signed transactions using Apple's
 * official App Store Server Library. The library checks the JWS `x5c`
 * certificate chain against Apple's bundled root CAs, verifies the signature,
 * and asserts the transaction's `bundleId` and `environment` match this app's
 * configuration — replacing the previous insecure JSON.parse decoder.
 *
 * Fails CLOSED: when `APPLE_BUNDLE_ID` is unset the endpoint is treated as
 * unconfigured and rejects every request (503) rather than trusting the
 * payload.
 */
@Injectable()
export class AppleIapVerifier {
  private readonly logger = new Logger(AppleIapVerifier.name);
  private readonly bundleId: string;
  private readonly appAppleId?: number;
  private readonly environment: Environment;
  private verifier: SignedDataVerifier | null = null;

  constructor(config: ConfigService) {
    this.bundleId = config.get<string>('appleBundleId') ?? '';
    const appAppleId = config.get<string>('appleAppAppleId');
    this.appAppleId =
      appAppleId && Number.isFinite(Number(appAppleId)) ? Number(appAppleId) : undefined;
    const env = config.get<string>('appleIapEnvironment') ?? 'Production';
    this.environment = env === 'Sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;
  }

  /** True only when an Apple bundle id is configured. */
  isConfigured(): boolean {
    return this.bundleId.length > 0;
  }

  /** Construct the underlying library verifier. Overridable seam for tests. */
  protected buildVerifier(): SignedDataVerifier {
    return new SignedDataVerifier(
      APPLE_ROOT_CERTIFICATES,
      true,
      this.environment,
      this.bundleId,
      this.appAppleId,
    );
  }

  private getVerifier(): SignedDataVerifier {
    if (!this.verifier) this.verifier = this.buildVerifier();
    return this.verifier;
  }

  /**
   * Verify and decode a StoreKit 2 signed transaction. Throws:
   * - 503 when Apple purchases are not configured (fail closed).
   * - 401 when the JWS signature / certificate chain / bundle / environment
   *   fails verification, or the payload lacks a transaction id.
   */
  async verifyTransaction(signedTransaction: string): Promise<VerifiedAppleTransaction> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Apple purchases not configured');
    }
    let decoded;
    try {
      decoded = await this.getVerifier().verifyAndDecodeTransaction(signedTransaction);
    } catch (err) {
      this.logger.warn(`Apple transaction verification failed: ${(err as Error).message ?? err}`);
      throw new UnauthorizedException('Apple transaction verification failed');
    }
    if (!decoded.transactionId) {
      throw new UnauthorizedException('Apple transaction missing a verified transaction id');
    }
    return {
      transactionId: decoded.transactionId,
      productId: decoded.productId,
      bundleId: decoded.bundleId,
    };
  }
}
