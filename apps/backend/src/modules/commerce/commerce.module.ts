import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { FundingModule } from '../funding/funding.module';
import { UsersModule } from '../users/users.module';
import { CommerceController } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { EntitlementService } from './entitlement.service';
import { AppleIapVerifier } from './drivers/apple-iap.verifier';
import { paymentDriverProvider } from './drivers/payment-driver.provider';

@Module({
  // FundingModule: the single Paystack webhook also settles coin top-ups.
  imports: [AuthModule, CatalogueModule, UsersModule, FundingModule],
  controllers: [CommerceController],
  providers: [CommerceService, EntitlementService, AppleIapVerifier, paymentDriverProvider],
  exports: [EntitlementService, CommerceService],
})
export class CommerceModule {}
