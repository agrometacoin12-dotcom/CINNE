import { Logger } from '@nestjs/common';
import type {
  InitializeInput,
  InitializeResult,
  PaymentDriver,
  VerifyResult,
} from '../domain/payment.driver';

/**
 * Offline payment driver. `initialize` returns a callback URL that the web app
 * opens to simulate the checkout page; `verify` always reports success. Lets the
 * full purchase/entitlement flow be exercised end-to-end without a PSP.
 */
export class MockPaymentDriver implements PaymentDriver {
  readonly provider = 'MOCK' as const;
  private readonly logger = new Logger(MockPaymentDriver.name);

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    this.logger.log(`[mock] initialize ${input.reference} ${input.amountMinor} ${input.currency}`);
    const sep = input.callbackUrl.includes('?') ? '&' : '?';
    return {
      reference: input.reference,
      authorizationUrl: `${input.callbackUrl}${sep}reference=${encodeURIComponent(input.reference)}&mock=1`,
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
