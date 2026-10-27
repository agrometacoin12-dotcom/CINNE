import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { TopupDto } from './dto/funding.dto';
import { KorapayTestService } from './korapay-test.service';

@Controller({ path: 'wallet/korapay-test', version: '1' })
export class KorapayTestController {
  constructor(private readonly test: KorapayTestService) {}
  @Get() summary(@CurrentUser() user: AuthenticatedUser) { return this.test.summary(user.sub); }
  @Get('checkout') checkout() { return this.test.checkout(); }
  @Post('topups') @Throttle({ default: { ttl: 60000, limit: 10 } })
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: TopupDto) { return this.test.start(user, dto.coins); }
  @Get('topups/verify')
  verify(@CurrentUser() user: AuthenticatedUser, @Query('reference') reference: string) { return this.test.verify(user.sub, reference ?? ''); }
  @Public() @Post('webhook') @HttpCode(200)
  webhook(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown) {
    return this.test.webhook(req.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {}), req.headers['x-korapay-signature'] as string | undefined);
  }
}
