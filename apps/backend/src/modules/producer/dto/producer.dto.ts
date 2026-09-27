import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AssignProducerDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /** Producer share of net ticket revenue in basis points (9000 = 90%). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  revenueShareBps?: number;
}

export class RequestWithdrawalDto {
  /** Whole naira. */
  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(100_000_000)
  amountNaira!: number;

  @IsString()
  @Length(2, 80)
  bankName!: string;

  @Matches(/^\d{10}$/, { message: 'Account number must be 10 digits (NUBAN)' })
  accountNumber!: string;

  @IsString()
  @Length(2, 120)
  accountName!: string;
}

export class ConfirmWithdrawalDto {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your email' })
  code!: string;
}

export class MarkPaidDto {
  @IsString()
  @Length(3, 120)
  transferRef!: string;
}

export class RejectWithdrawalDto {
  @IsString()
  @Length(3, 500)
  note!: string;
}

export class ListWithdrawalsQuery {
  @IsOptional()
  @IsIn(['REQUESTED', 'PAID', 'REJECTED'])
  status?: 'REQUESTED' | 'PAID' | 'REJECTED';
}
