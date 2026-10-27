import { KorapayTestService } from './korapay-test.service';
import { KorapayTestController } from './korapay-test.controller';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppleIapVerifier } from '../commerce/drivers/apple-iap.verifier';
import { GooglePlayVerifier } from '../commerce/drivers/google-play.verifier';
import { paymentDriverProvider } from '../commerce/drivers/payment-driver.provider';
import { UsersModule } from '../users/users.module';
import { AppleCoinsService } from './apple-coins.service';
import { AdminFundingController, FundingController, WalletController } from './funding.controller';
import { FundingService } from './funding.service';
import { GooglePlayCoinsService } from './google-play-coins.service';
import { WalletService } from './wallet.service';
import { AppleNotificationsService } from './apple-notifications.service';
import { AppleNotificationsController } from './apple-notifications.controller';

/** Coins (1 coin = ₦1): wallet, top-ups, transfers, and film funding pools. */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [KorapayTestController, WalletController, FundingController, AdminFundingController, AppleNotificationsController],
  providers: [
    KorapayTestService,
    AppleNotificationsService,
    AppleCoinsService,
    AppleIapVerifier,
    GooglePlayCoinsService,
    GooglePlayVerifier,
    WalletService,
    FundingService,
    paymentDriverProvider,
  ],
  exports: [WalletService],
})
export class FundingModule {}
