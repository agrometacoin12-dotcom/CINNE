import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Pushes realtime messages to connected clients via the WebSocket API Gateway
 * management API. Connection ids are stored by the realtime Lambdas (see
 * infrastructure/cdk/lambdas/realtime). Without REALTIME_ENDPOINT this logs.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private client?: ApiGatewayManagementApiClient;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('realtimeEndpoint', '');
    if (endpoint) {
      this.client = new ApiGatewayManagementApiClient({
        region: config.get<string>('region'),
        endpoint,
      });
    }
  }

  async sendToConnection(connectionId: string, payload: unknown): Promise<void> {
    if (!this.client) {
      this.logger.log(`[realtime] → ${connectionId}: ${JSON.stringify(payload)}`);
      return;
    }
    try {
      await this.client.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(payload)),
        }),
      );
    } catch (error) {
      // Stale connection — safe to ignore (the disconnect Lambda prunes it).
      this.logger.warn(`realtime send failed for ${connectionId}`);
    }
  }
}
