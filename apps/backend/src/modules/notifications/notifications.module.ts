import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { RealtimeService } from './realtime.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PushService, RealtimeService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
