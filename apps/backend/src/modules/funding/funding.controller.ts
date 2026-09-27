import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContributeDto, CreatePoolDto, PayoutDto, TopupDto, TransferDto } from './dto/funding.dto';
import { FundingService } from './funding.service';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller({ path: 'wallet', version: '1' })
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'My coin balance and recent activity (1 coin = ₦1)' })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.wallet.summary(user.sub);
  }

  @Post('topups')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Buy coins with naira (Paystack)' })
  topup(@CurrentUser() user: AuthenticatedUser, @Body() dto: TopupDto) {
    return this.wallet.startTopup({ sub: user.sub, email: user.email }, dto.coins);
  }

  @Get('topups/verify')
  @ApiOperation({ summary: 'Confirm a coin top-up by reference' })
  verify(@CurrentUser() user: AuthenticatedUser, @Query('reference') reference: string) {
    return this.wallet.verifyTopup(user.sub, reference ?? '');
  }

  @Post('transfers')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Send coins to another CinneTemple user' })
  transfer(@CurrentUser() user: AuthenticatedUser, @Body() dto: TransferDto) {
    return this.wallet.transfer({ sub: user.sub, email: user.email }, dto);
  }
}

@ApiTags('Funding')
@Controller({ path: 'funding/pools', version: '1' })
export class FundingController {
  constructor(private readonly funding: FundingService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Film funding pools' })
  list() {
    return this.funding.listPublic();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'One funding pool' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.funding.getPublic(id);
  }

  @ApiBearerAuth()
  @Get(':id/me')
  @ApiOperation({ summary: 'A pool with my stake in it' })
  mine(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.funding.getPublic(id, user.sub);
  }

  @ApiBearerAuth()
  @Post(':id/contributions')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Fund a film with coins from my wallet' })
  contribute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ContributeDto,
  ) {
    return this.funding.contribute(user.sub, id, dto.coins, dto.idempotencyKey);
  }

  @ApiBearerAuth()
  @Post(':id/refund')
  @ApiOperation({ summary: 'Claim my stake back — refunded as coins, never cash' })
  refund(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.funding.claimRefund(user.sub, id);
  }
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller({ path: 'admin/funding/pools', version: '1' })
export class AdminFundingController {
  constructor(private readonly funding: FundingService) {}

  @Get()
  @ApiOperation({ summary: 'All funding pools (admin)' })
  list() {
    return this.funding.listAdmin();
  }

  @Post()
  @ApiOperation({ summary: 'Open a funding pool for a film' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePoolDto) {
    return this.funding.create(user.sub, dto);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Stop accepting coins (and refund claims)' })
  close(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.funding.close(user.sub, id);
  }

  @Get(':id/payout-preview')
  @ApiOperation({ summary: 'Naira per coin and each backer’s share for a payout — no writes' })
  preview(@Param('id', new ParseUUIDPipe()) id: string, @Query() q: PayoutDto) {
    return this.funding.previewPayout(id, q.payoutCoins);
  }

  @Post(':id/payout')
  @ApiOperation({ summary: 'Set the payout (once) and credit every backer in coins' })
  payout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PayoutDto,
  ) {
    return this.funding.payout(user.sub, id, dto.payoutCoins);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel the pool and refund every backer in coins' })
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.funding.cancel(user.sub, id);
  }
}
