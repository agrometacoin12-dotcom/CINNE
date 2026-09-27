import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { COIN_LIMITS } from '../domain/coins';

/** Buy coins with naira. 1 coin = ₦1. */
export class TopupDto {
  @Type(() => Number)
  @IsInt()
  @Min(COIN_LIMITS.topupMin)
  @Max(COIN_LIMITS.topupMax)
  coins!: number;
}

export class TransferDto {
  @IsEmail()
  recipientEmail!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COIN_LIMITS.transferMax)
  coins!: number;

  /** Client-generated (one per send attempt) so a double-tap sends once. */
  @IsString()
  @Length(8, 64)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  note?: string;
}

export class ContributeDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COIN_LIMITS.contributionMax)
  coins!: number;

  @IsString()
  @Length(8, 64)
  idempotencyKey!: string;
}

export class CreatePoolDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  titleId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COIN_LIMITS.poolMax)
  goalCoins?: number;

  @IsOptional()
  @IsDateString()
  closesAt?: string;
}

/** Total coins to pay out across the pool. Each pooled coin earns payoutCoins ÷ totalCoins. */
export class PayoutDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(COIN_LIMITS.poolMax)
  payoutCoins!: number;
}
