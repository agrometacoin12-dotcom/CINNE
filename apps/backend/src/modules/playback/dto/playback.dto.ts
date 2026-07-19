import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * Player heartbeat (~every 10s). `durationSeconds` must be positive — a
 * non-positive duration is rejected with 400 (also re-checked in the service).
 * `episodeId` scopes the heartbeat to one episode of a series; absent, the
 * heartbeat targets the movie exactly as before.
 */
export class UpdateProgressDto {
  @IsInt()
  @Min(0)
  positionSeconds!: number;

  @IsInt()
  @Min(1)
  durationSeconds!: number;

  @IsOptional()
  @IsUUID()
  episodeId?: string;
}

/**
 * Optional body for POST /playback/:titleId/start. Movies send no body (or an
 * empty one); series playback targets one episode via `episodeId`.
 */
export class StartPlaybackDto {
  @IsOptional()
  @IsUUID()
  episodeId?: string;
}
