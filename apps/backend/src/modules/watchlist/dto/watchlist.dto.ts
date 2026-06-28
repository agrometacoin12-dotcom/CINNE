import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AddToWatchlistDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  titleId!: string;
}
