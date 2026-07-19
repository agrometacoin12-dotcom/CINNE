import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { MediaModule } from '../media/media.module';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminSeriesController } from './admin-series.controller';
import { AdminSeriesService } from './admin-series.service';

@Module({
  imports: [AuthModule, CatalogueModule, MediaModule],
  controllers: [AdminController, AdminSeriesController],
  providers: [AdminService, AdminSeriesService, AdminGuard],
})
export class AdminModule {}
