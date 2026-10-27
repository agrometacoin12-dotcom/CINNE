import { AuthModule } from '../auth/auth.module';
import { EmailAlertsService } from './email-alerts.service';
import { EmailAlertsController } from './email-alerts.controller';
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, EmailAlertsController],
  providers: [EmailAlertsService, NotificationsService, PushService, RealtimeService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
