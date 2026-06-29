import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class PurchaseDto {
  @IsUUID()
  titleId!: string;

  /** When buying for someone else (gifting), their account email. */
  @IsOptional()
  @IsEmail()
  beneficiaryEmail?: string;
}

/** Confirms a completed StoreKit (Apple In-App Purchase) transaction. */
export class ConfirmAppleDto {
  @IsUUID()
  titleId!: string;

  @IsString()
  @MinLength(1)
  transactionId!: string;

  /** The signed JWS transaction representation from StoreKit 2. */
  @IsString()
  @MinLength(1)
  signedTransaction!: string;
}
