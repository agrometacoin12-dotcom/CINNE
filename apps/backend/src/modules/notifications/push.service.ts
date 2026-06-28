import {
  CreatePlatformEndpointCommand,
  PublishCommand,
  SNSClient,
} from '@aws-sdk/client-sns';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Push delivery via Amazon SNS platform endpoints (APNs / web push). `local`
 * driver logs instead of sending so dev works without AWS.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly driver: 'local' | 'sns';
  private readonly platformAppArn: string;
  private client?: SNSClient;

  constructor(config: ConfigService) {
    this.driver = config.get<'local' | 'sns'>('pushDriver', 'local');
    this.platformAppArn = config.get<string>('snsPlatformAppArn', '');
    if (this.driver === 'sns') {
      this.client = new SNSClient({ region: config.get<string>('region') });
    }
  }

  /** Registers a device token, returning the SNS endpoint ARN (or null locally). */
  async createEndpoint(token: string): Promise<string | null> {
    if (this.driver === 'local' || !this.client || !this.platformAppArn) {
      this.logger.log(`[push] register token ${token.slice(0, 12)}…`);
      return null;
    }
    const res = await this.client.send(
      new CreatePlatformEndpointCommand({
        PlatformApplicationArn: this.platformAppArn,
        Token: token,
      }),
    );
    return res.EndpointArn ?? null;
  }

  async send(endpointArn: string | null, title: string, body: string): Promise<void> {
    if (this.driver === 'local' || !this.client || !endpointArn) {
      this.logger.log(`[push] → ${endpointArn ?? 'local'}: ${title} — ${body}`);
      return;
    }
    const payload = {
      default: body,
      APNS: JSON.stringify({ aps: { alert: { title, body }, sound: 'default' } }),
    };
    await this.client.send(
      new PublishCommand({
        TargetArn: endpointArn,
        MessageStructure: 'json',
        Message: JSON.stringify(payload),
      }),
    );
  }
}
