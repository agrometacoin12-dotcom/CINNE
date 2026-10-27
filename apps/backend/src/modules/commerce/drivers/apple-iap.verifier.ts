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
  appAccountToken?: string;
  type?: string;
  revocationDate?: number;
  quantity?: number;
  price?: number;
  currency?: string;
  environment?: string;
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
  private sandboxVerifier: SignedDataVerifier | null = null;

  constructor(config: ConfigService) {
    this.bundleId = config.get<string>('appleBundleId') ?? '';
    const appAppleId = config.get<string>('appleAppAppleId');
    this.appAppleId =
      appAppleId && Number.isFinite(Number(appAppleId)) ? Number(appAppleId) : undefined;
    const env = config.get<string>('appleIapEnvironment') ?? 'Production';
    this.environment = env === 'Sandbox' ? Environment.SANDBOX : Environment.PRODUCTION;
  }

  /** Production verification also requires the numeric App Store Connect app ID. */
  isConfigured(): boolean {
    return this.bundleId.length > 0 && (this.environment === Environment.SANDBOX || !!this.appAppleId);
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

  protected getSandboxVerifier(): SignedDataVerifier {
    return this.sandboxVerifier ??= new SignedDataVerifier(APPLE_ROOT_CERTIFICATES, true,
      Environment.SANDBOX, this.bundleId);
  }

  /** Only the coin path supports sandbox, settled into a separate non-spendable ledger. */
  async verifyCoinTransaction(signedTransaction: string): Promise<VerifiedAppleTransaction> {
    try { return await this.verifyTransaction(signedTransaction); }
    catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
      try {
        const t = await this.getSandboxVerifier().verifyAndDecodeTransaction(signedTransaction);
        if (!t.transactionId) throw new Error('Missing transaction ID');
        return { ...t, transactionId: t.transactionId };
      } catch (sandboxError) {
        const status = (sandboxError as { status?: number })?.status;
        this.logger.warn(`Apple sandbox verification failed (status=${status ?? 'unknown'})`);
        throw new UnauthorizedException('Apple could not verify this purchase. Please retry; contact support if this continues.');
      }
    }
  }

  /** Verify the outer notification independently of its nested transaction. */
  async verifyNotification(signedPayload: string) {
    if (!this.isConfigured()) throw new ServiceUnavailableException('Apple purchases not configured');
    try {
      let notification;
      try { notification = await this.getVerifier().verifyAndDecodeNotification(signedPayload); }
      catch { notification = await this.getSandboxVerifier().verifyAndDecodeNotification(signedPayload); }
      if (!notification.notificationUUID || !notification.notificationType ||
          !Number.isSafeInteger(notification.signedDate) || notification.signedDate! <= 0) {
        throw new Error('Missing notification identity or timestamp');
      }
      return notification;
    } catch {
      throw new UnauthorizedException('Apple notification verification failed');
    }
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
      this.logger.warn(`Apple transaction verification failed (status=${(err as { status?: number })?.status ?? 'unknown'})`);
      throw new UnauthorizedException('Apple transaction verification failed');
    }
    if (!decoded.transactionId) {
      throw new UnauthorizedException('Apple transaction missing a verified transaction id');
    }
    return {
      transactionId: decoded.transactionId,
      productId: decoded.productId,
      bundleId: decoded.bundleId,
      appAccountToken: decoded.appAccountToken,
      type: decoded.type,
      revocationDate: decoded.revocationDate,
      quantity: decoded.quantity,
      price: decoded.price,
      currency: decoded.currency,
      environment: decoded.environment,
    };
  }
}
