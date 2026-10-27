import { ServiceUnavailableException, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_DRIVER } from '../domain/payment.driver';
import { MockPaymentDriver } from './mock-payment.driver';
import { KorapayPaymentDriver } from './korapay-payment.driver';
import { PaystackPaymentDriver } from './paystack-payment.driver';

/** Driver-swappable payments: mock (offline) vs Paystack (web). Stateless, so
 *  each module that charges (tickets, coin top-ups) can hold its own instance. */
export const paymentDriverProvider: Provider = {
  provide: PAYMENT_DRIVER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const driver = config.get<string>('paymentDriver') ?? 'mock';
    const key = config.get<string>(driver === 'korapay' ? 'korapay.secretKey' : 'paystack.secretKey') ?? '';
    if (config.get<string>('env') === 'production' && (!['paystack', 'korapay'].includes(driver) || !key.startsWith('sk_live_'))) {
      const unavailable = async (): Promise<never> => { throw new ServiceUnavailableException('Website payments are not available yet. Please try again later.'); };
      return { provider: 'MOCK' as const, initialize: unavailable, verify: unavailable, verifyWebhookSignature: () => false };
    }
    if (driver === 'korapay') return new KorapayPaymentDriver(key, config.get<string>('korapay.webhookUrl') ?? 'https://api.cinnetemple.com/v1/payments/webhook');
    return driver === 'paystack'
      ? new PaystackPaymentDriver(config.get<string>('paystack.secretKey') ?? '')
      : new MockPaymentDriver(config.get<string>('webBaseUrl') ?? 'https://cinnetemple.com');
  },
};
