import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { UsersModule } from '../users/users.module';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { EntitlementService } from './entitlement.service';
import { AppleIapVerifier } from './drivers/apple-iap.verifier';
import { PAYMENT_DRIVER } from './domain/payment.driver';
import { MockPaymentDriver } from './drivers/mock-payment.driver';
import { PaystackPaymentDriver } from './drivers/paystack-payment.driver';

@Module({
  imports: [AuthModule, CatalogueModule, UsersModule],
  controllers: [CommerceController],
  providers: [
    CommerceService,
    EntitlementService,
    AppleIapVerifier,
    {
      // Driver-swappable payments: mock (offline) vs Paystack (web).
      provide: PAYMENT_DRIVER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('paymentDriver') ?? 'mock';
        return driver === 'paystack'
          ? new PaystackPaymentDriver(config.get<string>('paystack.secretKey') ?? '')
          : new MockPaymentDriver(config.get<string>('webBaseUrl') ?? 'https://cinnetemple.com');
      },
    },
  ],
  exports: [EntitlementService, CommerceService],
})
export class CommerceModule {}
