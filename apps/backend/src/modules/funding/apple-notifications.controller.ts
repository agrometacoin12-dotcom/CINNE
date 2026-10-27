import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator';
import { AppleNotificationsService } from './apple-notifications.service';

class AppleNotificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  signedPayload!: string;
}

@Controller({ path: 'wallet/apple/notifications', version: '1' })
export class AppleNotificationsController {
  constructor(private readonly notifications: AppleNotificationsService) {}

  // Apple authenticates with its signed JWS, never with a user's bearer token.
  @Public()
  @SkipThrottle()
  @Post()
  @HttpCode(200)
  receive(@Body() body: AppleNotificationDto) {
    return this.notifications.receive(body.signedPayload);
  }
}
