import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { RedisService } from '../../infra/redis/redis.service';

/**
 * Generates and verifies short-lived one-time codes (email verification,
 * password reset) stored in Redis with a TTL. Used in the `local` auth driver;
 * with Cognito these flows are handled by Cognito itself.
 */
@Injectable()
export class VerificationService {
  private static readonly TTL_SECONDS = 15 * 60;

  constructor(private readonly redis: RedisService) {}

  private key(purpose: string, email: string): string {
    return `otp:${purpose}:${email.toLowerCase()}`;
  }

  async issue(purpose: 'verify' | 'reset', email: string): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.client.set(
      this.key(purpose, email),
      code,
      'EX',
      VerificationService.TTL_SECONDS,
    );
    return code;
  }

  async verify(purpose: 'verify' | 'reset', email: string, code: string): Promise<boolean> {
    const stored = await this.redis.client.get(this.key(purpose, email));
    if (stored && stored === code) {
      await this.redis.client.del(this.key(purpose, email));
      return true;
    }
    return false;
  }
}
