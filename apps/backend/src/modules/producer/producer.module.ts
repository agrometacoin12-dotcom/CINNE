import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { AdminProducerController, ProducerController } from './producer.controller';
import { ProducerKeyGuard } from './producer-key.guard';
import { ProducerService } from './producer.service';

/** Producer dashboard links, views/earnings reporting and naira withdrawals. */
@Module({
  imports: [AuthModule, CatalogueModule],
  controllers: [ProducerController, AdminProducerController],
  providers: [ProducerService, ProducerKeyGuard],
})
export class ProducerModule {}
