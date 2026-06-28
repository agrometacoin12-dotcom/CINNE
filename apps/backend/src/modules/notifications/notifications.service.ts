import { Injectable } from '@nestjs/common';
import { DevicePlatform } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PushService } from './push.service';
import { RealtimeService } from './realtime.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Registers (or refreshes) a device token for push notifications. */
  async registerDevice(userId: string, platform: DevicePlatform, token: string) {
    const endpointArn = await this.push.createEndpoint(token);
    await this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform, endpointArn },
      create: { userId, platform, token, endpointArn },
    });
    return { success: true };
  }

  async unregisterDevice(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { success: true };
  }

  /** Sends a push to all of a user's registered devices. */
  async notifyUser(userId: string, title: string, body: string) {
    const devices = await this.prisma.deviceToken.findMany({ where: { userId } });
    await Promise.all(devices.map((d) => this.push.send(d.endpointArn, title, body)));
    return { delivered: devices.length };
  }

  /** Pushes a realtime payload to a specific WebSocket connection. */
  async pushRealtime(connectionId: string, payload: unknown) {
    await this.realtime.sendToConnection(connectionId, payload);
  }
}
