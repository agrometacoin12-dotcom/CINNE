/**
 * Payment provider abstraction (Strategy pattern). Web uses Paystack; the mock
 * driver lets the entire purchase → entitlement flow run offline. iOS will add an
 * Apple In-App Purchase verifier behind this same interface.
 */
export interface InitializeInput {
  reference: string;
  amountMinor: number;
  currency: string;
  email: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeResult {
  reference: string;
  /** Where to send the buyer to complete payment. Null = settled immediately. */
  authorizationUrl: string | null;
}

export type PaymentStatus = 'paid' | 'failed' | 'pending';

export interface VerifyResult {
  status: PaymentStatus;
  amountMinor?: number;
  currency?: string;
}

export interface PaymentDriver {
  readonly provider: 'MOCK' | 'PAYSTACK';
  initialize(input: InitializeInput): Promise<InitializeResult>;
  verify(reference: string): Promise<VerifyResult>;
  /** Validate a provider webhook signature. Mock returns true. */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean;
}

export const PAYMENT_DRIVER = Symbol('PAYMENT_DRIVER');
