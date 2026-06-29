import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { CommerceModule } from '../commerce/commerce.module';
import { UsersModule } from '../users/users.module';
import { PremiereController } from './premiere.controller';
import { PremiereService } from './premiere.service';

@Module({
  imports: [CatalogueModule, CommerceModule, UsersModule],
  controllers: [PremiereController],
  providers: [PremiereService],
})
export class PremiereModule {}
