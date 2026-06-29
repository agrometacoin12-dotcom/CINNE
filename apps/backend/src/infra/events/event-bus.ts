import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

/** Canonical domain event names (the contract between producers and consumers). */
export type DomainEventName =
  | 'user.registered'
  | 'user.verified'
  | 'watchlist.added'
  | 'title.released'
  // Mobile cinema
  | 'movie.created'
  | 'movie.premiere.scheduled'
  | 'purchase.paid'
  | 'premiere.chat.message';

export interface DomainEvent<T = Record<string, unknown>> {
  name: DomainEventName;
  detail: T;
}

/**
 * Publishes domain events. `eventbridge` driver emits to an EventBridge bus
 * (which fans out to SQS / Step Functions / SNS); `local` driver logs, keeping
 * dev fully offline.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);
  private readonly driver: 'local' | 'eventbridge';
  private readonly busName: string;
  private readonly source = 'cinnetemple.backend';
  private client?: EventBridgeClient;

  constructor(config: ConfigService) {
    this.driver = config.get<'local' | 'eventbridge'>('eventsDriver', 'local');
    this.busName = config.get<string>('eventBusName', 'cinnetemple');
    if (this.driver === 'eventbridge') {
      this.client = new EventBridgeClient({ region: config.get<string>('region') });
    }
  }

  async publish<T extends Record<string, unknown>>(event: DomainEvent<T>): Promise<void> {
    if (this.driver === 'local' || !this.client) {
      this.logger.log(`[event] ${event.name} ${JSON.stringify(event.detail)}`);
      return;
    }
    await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.busName,
            Source: this.source,
            DetailType: event.name,
            Detail: JSON.stringify(event.detail),
          },
        ],
      }),
    );
  }
}
