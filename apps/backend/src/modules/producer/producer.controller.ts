import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Producer } from '@prisma/client';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  AssignProducerDto,
  ConfirmWithdrawalDto,
  ListWithdrawalsQuery,
  MarkPaidDto,
  RejectWithdrawalDto,
  RequestWithdrawalDto,
} from './dto/producer.dto';
import { CurrentProducer, PRODUCER_KEY_HEADER, ProducerKeyGuard } from './producer-key.guard';
import { ProducerService } from './producer.service';

/** The producer's own dashboard, authenticated by their link key. */
@ApiTags('Producer')
@ApiHeader({ name: PRODUCER_KEY_HEADER, description: 'Key from the producer dashboard link' })
@Public()
@UseGuards(ProducerKeyGuard)
@Throttle({ default: { ttl: 60_000, limit: 30 } })
@Controller({ path: 'producer', version: '1' })
export class ProducerController {
  constructor(private readonly producers: ProducerService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Views, earnings, balance and withdrawals for my films' })
  dashboard(@CurrentProducer() producer: Producer) {
    return this.producers.dashboard(producer);
  }

  @Post('withdrawals')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Start a naira withdrawal — emails a 6-digit code' })
  request(@CurrentProducer() producer: Producer, @Body() dto: RequestWithdrawalDto) {
    return this.producers.requestWithdrawal(producer, dto);
  }

  @Post('withdrawals/:id/confirm')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Confirm a withdrawal with the emailed code' })
  confirm(
    @CurrentProducer() producer: Producer,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfirmWithdrawalDto,
  ) {
    return this.producers.confirmWithdrawal(producer, id, dto.code);
  }
}

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminProducerController {
  constructor(private readonly producers: ProducerService) {}

  @Get('movies/:id/producer')
  @ApiOperation({ summary: 'The producer linked to a title, if any' })
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    return { producer: await this.producers.forTitle(id) };
  }

  @Put('movies/:id/producer')
  @ApiOperation({ summary: 'Link a producer by email and send their dashboard link' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignProducerDto,
  ) {
    return this.producers.assign(user.sub, id, dto);
  }

  @Post('movies/:id/producer/resend')
  @ApiOperation({ summary: 'Send a fresh dashboard link (old links stop working)' })
  resend(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.producers.resendLink(user.sub, id);
  }

  @Get('producer-withdrawals')
  @ApiOperation({ summary: 'Producer withdrawal queue' })
  list(@Query() q: ListWithdrawalsQuery) {
    return this.producers.listWithdrawals(q.status);
  }

  @Post('producer-withdrawals/:id/paid')
  @ApiOperation({ summary: 'Mark a withdrawal paid after sending the bank transfer' })
  paid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MarkPaidDto,
  ) {
    return this.producers.markPaid(user.sub, id, dto.transferRef);
  }

  @Post('producer-withdrawals/:id/reject')
  @ApiOperation({ summary: 'Decline a withdrawal (amount returns to the producer balance)' })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectWithdrawalDto,
  ) {
    return this.producers.reject(user.sub, id, dto.note);
  }
}
