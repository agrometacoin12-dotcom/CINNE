import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSeriesDto {
  @IsString()
  @MinLength(1)
  title!: string;

  /** Explicit `null` means "clear the field" on update; undefined = unchanged. */
  @IsOptional()
  @IsString()
  tagline?: string | null;

  @IsString()
  @MinLength(1)
  overview!: string;

  @IsInt()
  year!: number;

  @IsArray()
  @IsString({ each: true })
  genres!: string[];

  @IsOptional()
  @IsString()
  maturityRating?: string | null;

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

  /** Price to watch the series once, in the smallest currency unit (kobo). */
  @IsInt()
  @Min(0)
  priceMinor!: number;

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
  @IsBoolean()
  featured?: boolean;
}

/** All fields optional — partial metadata update, plus publication status. */
export class UpdateSeriesDto extends CreateSeriesDto {
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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  declare genres: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  declare priceMinor: number;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';

  @IsOptional()
  @IsInt()
  popularity?: number;
}

export class CreateSeasonDto {
  @IsInt()
  @Min(1)
  number!: number;

  @IsOptional()
  @IsString()
  name?: string | null;

  @IsOptional()
  @IsString()
  overview?: string | null;
}

/** All fields optional — partial season update. */
export class UpdateSeasonDto extends CreateSeasonDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  declare number: number;
}

export class CreateEpisodeDto {
  @IsInt()
  @Min(1)
  number!: number;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  overview?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  runtimeMinutes?: number | null;
}

/** All fields optional — partial episode update incl. media keys. */
export class UpdateEpisodeDto extends CreateEpisodeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  declare number: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  declare name: string;

  @IsOptional()
  @IsString()
  videoKey?: string | null;

  @IsOptional()
  @IsString()
  stillKey?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationSeconds?: number | null;
}
