import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommerceService } from './commerce.service';
import { ConfirmAppleDto, PurchaseDto } from './dto/commerce.dto';

@ApiTags('Commerce')
@Controller({ version: '1' })
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}

  @ApiBearerAuth()
  @Post('purchases')
  @ApiOperation({ summary: 'Buy a pay-per-view (optionally gift to another user)' })
  purchase(@CurrentUser() user: AuthenticatedUser, @Body() dto: PurchaseDto) {
    return this.commerce.purchase({ sub: user.sub, email: user.email }, dto);
  }

  @ApiBearerAuth()
  @Post('purchases/apple')
  @ApiOperation({ summary: 'Confirm an Apple In-App Purchase (StoreKit)' })
  confirmApple(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmAppleDto) {
    return this.commerce.confirmApple({ sub: user.sub, email: user.email }, dto);
  }

  @ApiBearerAuth()
  @Get('purchases/verify')
  @ApiOperation({ summary: 'Verify a payment by reference' })
  verify(@Query('reference') reference: string) {
    return this.commerce.verify(reference);
  }

  @ApiBearerAuth()
  @Get('purchases')
  @ApiOperation({ summary: 'My purchase history' })
  myPurchases(@CurrentUser() user: AuthenticatedUser) {
    return this.commerce.myPurchases(user.sub);
  }

  @ApiBearerAuth()
  @Get('entitlements')
  @ApiOperation({ summary: 'Titles I currently hold the right to watch' })
  entitlements(@CurrentUser() user: AuthenticatedUser) {
    return this.commerce.myEntitlements(user.sub);
  }

  @Public()
  @Post('payments/webhook')
  @ApiOperation({ summary: 'Payment provider webhook (signature-verified)' })
  webhook(@Req() req: Request & { rawBody?: Buffer }, @Body() body: unknown) {
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(body ?? {});
    const signature =
      (req.headers['x-paystack-signature'] as string | undefined) ??
      (req.headers['x-webhook-signature'] as string | undefined);
    return this.commerce.handleWebhook(raw, signature);
  }
}
