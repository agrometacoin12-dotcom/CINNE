import { createHmac, timingSafeEqual } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import type { PaymentDriver, InitializeInput, InitializeResult, VerifyResult } from '../domain/payment.driver';
const API = 'https://api.korapay.com/merchant/api/v1';
/** Kora amounts are major currency units; our ledger uses integer minor units. */
export function koraMinor(value: unknown): number {
  const amount = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error('Invalid Korapay amount');
  const [whole, fraction = ''] = amount.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) throw new Error('Invalid Korapay amount');
  return minor;
}
export class KorapayPaymentDriver implements PaymentDriver {
  readonly provider = 'KORAPAY' as const;
  constructor(private readonly secretKey: string, private readonly webhookUrl: string) {}
  private async call(path: string, body?: unknown) {
    if (!this.secretKey) throw new ServiceUnavailableException('Website payments are not available yet.');
    const response = await fetch(API + path, {method:body?'POST':'GET', signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Bearer ${this.secretKey}`, 'Content-Type':'application/json'},
      ...(body ? {body:JSON.stringify(body)} : {})});
    const json = await response.json() as {status:boolean;data?:Record<string, unknown>};
    if (!response.ok || json.status !== true || !json.data) throw new ServiceUnavailableException('Korapay is temporarily unavailable. Check payment status before paying again.');
    return json.data;
  }
  async initialize(input: InitializeInput): Promise<InitializeResult> {
    const data = await this.call('/charges/initialize', {reference:input.reference, amount:input.amountMinor / 100,
      currency:input.currency, customer:{email:input.email}, redirect_url:input.callbackUrl,
      notification_url:this.webhookUrl, narration:'CinneTemple purchase', merchant_bears_cost:true});
    if (data.reference !== input.reference || typeof data.checkout_url !== 'string') throw new Error('Korapay checkout reference mismatch');
    const url = new URL(data.checkout_url);
    const allowedHosts = this.secretKey.startsWith('sk_test_') ? ['checkout.korapay.com', 'test-checkout.korapay.com'] : ['checkout.korapay.com'];
    if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname)) throw new Error('Invalid Korapay checkout URL');
    return {reference:input.reference,authorizationUrl:url.href};
  }
  async verify(reference:string): Promise<VerifyResult> {
    const data = await this.call('/charges/' + encodeURIComponent(reference));
    if (data.reference !== reference) throw new Error('Korapay payment reference mismatch');
    const status = data.status === 'success' ? 'paid' : ['failed','expired'].includes(String(data.status)) ? 'failed' : 'pending';
    if (status !== 'paid') return {status};
    // For bank transfers Kora's accepted amount reflects under/overpayment policy.
    return {status, amountMinor:koraMinor(data.amount_accepted ?? data.amount_paid ?? data.amount),
      currency:typeof data.currency === 'string' ? data.currency : undefined};
  }
  verifyWebhookSignature(raw:string,signature:string|undefined):boolean {
    if (!this.secretKey || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    try {
      const {data} = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
      const expected=createHmac('sha256',this.secretKey).update(JSON.stringify(data)).digest();
      return timingSafeEqual(expected,Buffer.from(signature,'hex'));
    } catch { return false; }
  }
}
