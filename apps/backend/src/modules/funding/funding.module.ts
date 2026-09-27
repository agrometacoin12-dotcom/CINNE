import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { paymentDriverProvider } from '../commerce/drivers/payment-driver.provider';
import { AdminFundingController, FundingController, WalletController } from './funding.controller';
import { FundingService } from './funding.service';
import { WalletService } from './wallet.service';

/** Coins (1 coin = ₦1): wallet, top-ups, transfers, and film funding pools. */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [WalletController, FundingController, AdminFundingController],
  providers: [WalletService, FundingService, paymentDriverProvider],
  exports: [WalletService],
})
export class FundingModule {}
