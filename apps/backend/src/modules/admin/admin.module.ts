import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { MediaModule } from '../media/media.module';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminSeriesController } from './admin-series.controller';
import { AdminSeriesService } from './admin-series.service';
import { AdminClassificationController } from './admin-classification.controller';
import { AdminHomeController } from './admin-home.controller';
import { AdminHomeService } from './admin-home.service';

@Module({
  imports: [AuthModule, CatalogueModule, MediaModule],
  controllers: [
    AdminController,
    AdminSeriesController,
    AdminClassificationController,
    AdminHomeController,
  ],
  providers: [AdminService, AdminSeriesService, AdminHomeService, AdminGuard],
})
export class AdminModule {}
