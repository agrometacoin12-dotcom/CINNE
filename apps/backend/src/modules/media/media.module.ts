import { ArtworkService } from './artwork.service';
import { AdaptiveMediaService } from './adaptive-media.service';
import { AdaptiveMediaController } from './adaptive-media.controller';
import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  controllers: [MediaController, AdaptiveMediaController],
  providers: [ArtworkService, MediaService, AdaptiveMediaService],
  exports: [ArtworkService, MediaService, AdaptiveMediaService],
})
export class MediaModule {}
