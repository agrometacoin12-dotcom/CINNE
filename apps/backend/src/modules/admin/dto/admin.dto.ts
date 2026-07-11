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
  Min,
  MinLength,
} from 'class-validator';

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
  @IsIn(['video', 'poster', 'hero'])
  kind!: 'video' | 'poster' | 'hero';

  @IsString()
  @MinLength(3)
  contentType!: string;
}
