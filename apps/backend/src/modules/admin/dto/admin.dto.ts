import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMovieDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsIn(['movie', 'series'])
  type?: 'movie' | 'series';

  /** Explicit `null` means "clear the field" on update; undefined = unchanged. */
  @IsOptional()
  @IsString()
  tagline?: string | null;

  @IsString()
  @MinLength(1)
  overview!: string;

  @IsInt()
  year!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cast?: string[];

  @IsOptional()
  @IsString()
  director?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsString()
  maturityRating?: string | null;

  @IsOptional()
  @IsInt()
  runtimeMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  /** Price to watch once, in the smallest currency unit (e.g. kobo). */
  @IsOptional()
  @IsInt()
  @Min(0)
  priceMinor?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  posterKey?: string | null;

  @IsOptional()
  @IsString()
  heroKey?: string | null;

  @IsOptional()
  @IsString()
  videoKey?: string | null;

  @IsOptional()
  @IsString()
  trailerKey?: string | null;

  @IsOptional()
  @IsInt()
  popularity?: number;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';

  @IsOptional()
  @IsBoolean()
  isPremiere?: boolean;

  @IsOptional()
  @IsISO8601()
  premiereStartAt?: string | null;
}

/** All fields optional — partial update. */
export class UpdateMovieDto extends CreateMovieDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  declare title: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  declare overview: string;

  @IsOptional()
  @IsInt()
  declare year: number;
}

export class SetFeaturedDto {
  @IsBoolean()
  featured!: boolean;
}

export class SetPremiereDto {
  @IsBoolean()
  isPremiere!: boolean;

  @IsOptional()
  @IsISO8601()
  premiereStartAt?: string;
}

export const ASSIGNABLE_ROLES = ['user', 'admin'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export class SetUserRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(ASSIGNABLE_ROLES, { each: true })
  roles!: AssignableRole[];
}

/** Admin-settable account states (the schema enum also has transient states). */
export const ADMIN_USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;

export class SetUserStatusDto {
  @IsIn(ADMIN_USER_STATUSES)
  status!: 'ACTIVE' | 'SUSPENDED';
}

export class PresignUploadDto {
  @IsIn(['video', 'poster', 'hero', 'still', 'trailer'])
  kind!: 'video' | 'poster' | 'hero' | 'still' | 'trailer';

  @IsString()
  @MinLength(3)
  contentType!: string;

  /** Enables multipart presigning for capable clients; omitted by older Studio builds. */
  @IsOptional()
  @IsInt()
  @Min(1)
  fileSize?: number;
}

export class CompletedUploadPartDto {
  @IsInt()
  @Min(1)
  @Max(10_000)
  partNumber!: number;

  @IsString()
  @MinLength(1)
  etag!: string;
}

export class CompleteMultipartUploadDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  uploadId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CompletedUploadPartDto)
  parts!: CompletedUploadPartDto[];
}

export class AbortMultipartUploadDto {
  @IsString()
  @MinLength(1)
  key!: string;

  @IsString()
  @MinLength(1)
  uploadId!: string;
}
