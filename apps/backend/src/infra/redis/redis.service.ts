import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) public readonly client: Redis) {}

  static create(config: ConfigService): Redis {
    const url = config.get<string>('redisUrl') ?? 'redis://localhost:6379';
    return new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
  }

  /** Simple fixed-window rate-limit helper backed by Redis. */
  async hitRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSeconds);
    }
    return count <= limit;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
