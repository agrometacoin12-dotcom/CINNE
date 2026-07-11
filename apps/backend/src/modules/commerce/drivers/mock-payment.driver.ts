import { Logger } from '@nestjs/common';
import type {
  InitializeInput,
  InitializeResult,
  PaymentDriver,
  VerifyResult,
} from '../domain/payment.driver';

/**
 * Offline payment driver. `initialize` sends the buyer to the web app's mock
 * checkout page (so the "payment" is a visible, confirmable step instead of a
 * silent instant charge); that page's Confirm button then hits the existing
 * `/payment/callback?reference=..&mock=1` path. `verify` always reports success,
 * letting the full purchase/entitlement flow be exercised end-to-end without a PSP.
 */
export class MockPaymentDriver implements PaymentDriver {
  readonly provider = 'MOCK' as const;
  private readonly logger = new Logger(MockPaymentDriver.name);

  constructor(private readonly webBaseUrl: string) {}

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    this.logger.log(`[mock] initialize ${input.reference} ${input.amountMinor} ${input.currency}`);
    const titleName = typeof input.metadata?.titleName === 'string' ? input.metadata.titleName : '';
    const params = new URLSearchParams({
      reference: input.reference,
      title: titleName,
      amount: String(input.amountMinor),
      currency: input.currency,
    });
    const base = this.webBaseUrl.replace(/\/$/, '');
    return {
      reference: input.reference,
      authorizationUrl: `${base}/payment/mock-checkout?${params.toString()}`,
    };
  }

  async verify(reference: string): Promise<VerifyResult> {
    this.logger.log(`[mock] verify ${reference} → paid`);
    return { status: 'paid' };
  }

  verifyWebhookSignature(): boolean {
    return true;
  }
}
