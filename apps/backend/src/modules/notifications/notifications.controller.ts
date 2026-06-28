import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('devices')
  @ApiOperation({ summary: 'Register a device for push notifications' })
  registerDevice(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(user.sub, dto.platform, dto.token);
  }

  @Delete('devices/:token')
  @ApiOperation({ summary: 'Unregister a device token' })
  unregisterDevice(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.notifications.unregisterDevice(user.sub, token);
  }
}
