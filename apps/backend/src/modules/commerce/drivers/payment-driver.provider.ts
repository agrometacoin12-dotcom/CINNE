import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYMENT_DRIVER } from '../domain/payment.driver';
import { MockPaymentDriver } from './mock-payment.driver';
import { PaystackPaymentDriver } from './paystack-payment.driver';

/** Driver-swappable payments: mock (offline) vs Paystack (web). Stateless, so
 *  each module that charges (tickets, coin top-ups) can hold its own instance. */
export const paymentDriverProvider: Provider = {
  provide: PAYMENT_DRIVER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const driver = config.get<string>('paymentDriver') ?? 'mock';
    return driver === 'paystack'
      ? new PaystackPaymentDriver(config.get<string>('paystack.secretKey') ?? '')
      : new MockPaymentDriver(config.get<string>('webBaseUrl') ?? 'https://cinnetemple.com');
  },
};
