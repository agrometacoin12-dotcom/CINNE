/**
 * WebSocket API Gateway handlers. Connection ids are stored in DynamoDB so the
 * backend can push messages to clients via the management API.
 *
 *   $connect    → store connectionId
 *   $disconnect → delete connectionId
 *   $default    → echo / ping handler
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.CONNECTIONS_TABLE!;

interface WsEvent {
  requestContext: { connectionId: string; routeKey: string; authorizer?: { userId?: string } };
  body?: string;
}

export const connect = async (event: WsEvent) => {
  await doc.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        connectionId: event.requestContext.connectionId,
        userId: event.requestContext.authorizer?.userId ?? 'anonymous',
        connectedAt: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      },
    }),
  );
  return { statusCode: 200, body: 'connected' };
};

export const disconnect = async (event: WsEvent) => {
  await doc.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { connectionId: event.requestContext.connectionId },
    }),
  );
  return { statusCode: 200, body: 'disconnected' };
};

export const defaultHandler = async (event: WsEvent) => {
  // Lightweight ping/echo; real fan-out is driven by the backend RealtimeService.
  return { statusCode: 200, body: JSON.stringify({ echo: event.body ?? null }) };
};
