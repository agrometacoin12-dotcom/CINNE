import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Producer } from '@prisma/client';
import { ProducerService } from './producer.service';

/** Header the producer dashboard sends its link key in (never in the URL). */
export const PRODUCER_KEY_HEADER = 'x-producer-key';

/**
 * Authenticates a producer by the key from their dashboard link. Routes using
 * this guard are also @Public() so the viewer JWT guard doesn't apply.
 */
@Injectable()
export class ProducerKeyGuard implements CanActivate {
  constructor(private readonly producers: ProducerService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers[PRODUCER_KEY_HEADER] as string | undefined;
    const producer = await this.producers.authenticate(key);
    if (!producer) {
      throw new UnauthorizedException(
        'This dashboard link is invalid or has been replaced. Ask CinneTemple for a new one.',
      );
    }
    req.producer = producer;
    return true;
  }
}

export const CurrentProducer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Producer => ctx.switchToHttp().getRequest().producer,
);
