import { createHmac, timingSafeEqual } from 'node:crypto';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type {
  InitializeInput,
  InitializeResult,
  PaymentDriver,
  PaymentStatus,
  VerifyResult,
} from '../domain/payment.driver';

const PAYSTACK_API = 'https://api.paystack.co';

/**
 * Paystack integration. Server-side only: the secret key initializes a
 * transaction and verifies it; the webhook signature is the HMAC-SHA512 of the
 * raw body keyed by the same secret. Keys come from Secrets Manager / env and are
 * never seen by the client.
 */
export class PaystackPaymentDriver implements PaymentDriver {
  readonly provider = 'PAYSTACK' as const;
  private readonly logger = new Logger(PaystackPaymentDriver.name);

  constructor(private readonly secretKey: string) {
    if (!secretKey) {
      this.logger.warn('PAYSTACK_SECRET_KEY is empty — Paystack calls will fail.');
    }
  }

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    const json = (await res.json()) as {
      status: boolean;
      message: string;
      data?: { authorization_url: string; reference: string };
    };
    if (!res.ok || !json.status || !json.data) {
      throw new Error(`Paystack initialize failed: ${json.message ?? res.statusText}`);
    }
    const url = new URL(json.data.authorization_url);
    if (json.data.reference !== input.reference || url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com' || url.username || url.password) {
      throw new Error('Invalid Paystack checkout response');
    }
    return { reference: input.reference, authorizationUrl: url.href };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
      signal: AbortSignal.timeout(15000),
    });
    const json = (await res.json()) as {
      status: boolean;
      data?: { status: string; amount: number; currency: string; reference: string; domain: string };
    };
    if (!res.ok || !json.status || !json.data) throw new ServiceUnavailableException('Payment verification is temporarily unavailable. Retry without paying again.');
    if (json.data.reference !== reference || (this.secretKey.startsWith('sk_live_') && json.data.domain !== 'live')) {
      throw new Error('Payment verification reference or environment mismatch');
    }
    const map: Record<string, PaymentStatus> = {
      success: 'paid',
      failed: 'failed',
      abandoned: 'failed',
    };
    return {
      status: map[json.data.status] ?? 'pending',
      amountMinor: json.data.amount,
      currency: json.data.currency,
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!this.secretKey || !signature) return false;
    const expected = createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
