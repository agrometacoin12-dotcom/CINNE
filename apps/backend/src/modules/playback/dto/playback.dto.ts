import { IsInt, Min } from 'class-validator';

/**
 * Player heartbeat (~every 10s). `durationSeconds` must be positive — a
 * non-positive duration is rejected with 400 (also re-checked in the service).
 */
export class UpdateProgressDto {
  @IsInt()
  @Min(0)
  positionSeconds!: number;

  @IsInt()
  @Min(1)
  durationSeconds!: number;
}
