import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { CommerceModule } from '../commerce/commerce.module';
import { MediaModule } from '../media/media.module';
import { PlaybackController } from './playback.controller';
import { PlaybackService } from './playback.service';

@Module({
  imports: [AuthModule, CatalogueModule, CommerceModule, MediaModule],
  controllers: [PlaybackController],
  providers: [PlaybackService],
})
export class PlaybackModule {}
