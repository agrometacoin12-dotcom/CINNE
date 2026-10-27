import { createSign } from 'node:crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface VerifiedGooglePlayPurchase {
  productId?: string;
  orderId?: string;
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
  purchaseType?: number;
  quantity?: number;
  obfuscatedExternalAccountId?: string;
}

/**
 * Verifies and consumes one-time products through the Google Play Android
 * Publisher API. The client supplies only a product id and purchase token;
 * purchase state, quantity and account binding are all read from Google.
 */
@Injectable()
export class GooglePlayVerifier {
  private readonly logger = new Logger(GooglePlayVerifier.name);
  private readonly packageName: string;
  private readonly credentials: GoogleServiceAccount | null;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(config: ConfigService) {
    this.packageName = config.get<string>('googlePlayPackageName') ?? '';
    const raw = config.get<string>('googlePlayServiceAccountJson') ?? '';
    this.credentials = this.parseCredentials(raw);
  }

  isConfigured(): boolean {
    return this.packageName.length > 0 && this.credentials !== null;
  }

  async verifyPurchase(
    productId: string,
    purchaseToken: string,
  ): Promise<VerifiedGooglePlayPurchase> {
    this.assertConfigured();
    const result = await this.googleRequest(
      'GET',
      `/androidpublisher/v3/applications/${encodeURIComponent(this.packageName)}` +
        `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`,
    );
    return result as VerifiedGooglePlayPurchase;
  }

  /** Consuming a one-time product both acknowledges it and permits repurchase. */
  async consume(productId: string, purchaseToken: string): Promise<void> {
    this.assertConfigured();
    await this.googleRequest(
      'POST',
      `/androidpublisher/v3/applications/${encodeURIComponent(this.packageName)}` +
        `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`,
    );
  }

  private parseCredentials(raw: string): GoogleServiceAccount | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<GoogleServiceAccount>;
      if (!parsed.client_email || !parsed.private_key) return null;
      return parsed as GoogleServiceAccount;
    } catch {
      this.logger.warn('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON');
      return null;
    }
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Google Play purchases are not configured');
    }
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && this.cachedToken.expiresAt - 60 > now) return this.cachedToken.value;
    const credentials = this.credentials!;
    const tokenUri = credentials.token_uri ?? 'https://oauth2.googleapis.com/token';
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64Url(
      JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      }),
    );
    const unsigned = `${header}.${claims}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    signer.end();
    const assertion = `${unsigned}.${signer.sign(credentials.private_key).toString('base64url')}`;
    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      this.logger.error(`Google OAuth token request failed (${response.status})`);
      throw new ServiceUnavailableException('Google Play verification is temporarily unavailable');
    }
    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new ServiceUnavailableException('Google Play verification is temporarily unavailable');
    }
    this.cachedToken = { value: body.access_token, expiresAt: now + (body.expires_in ?? 3600) };
    return body.access_token;
  }

  private async googleRequest(method: 'GET' | 'POST', path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`https://androidpublisher.googleapis.com${path}`, {
        method,
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.warn(`Google Play request failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Google Play verification is temporarily unavailable');
    }
    if (response.ok) {
      if (response.status === 204 || method === 'POST') return {};
      return response.json();
    }
    this.logger.warn(`Google Play rejected ${method} purchase request (${response.status})`);
    if (
      response.status === 400 ||
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    ) {
      throw new UnauthorizedException('Google Play purchase verification failed');
    }
    throw new ServiceUnavailableException('Google Play verification is temporarily unavailable');
  }
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}
