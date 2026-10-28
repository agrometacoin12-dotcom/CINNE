import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { AccessType, Audience, ContentFormat, HomeSort } from '@prisma/client';
import {
  ACCESS_TYPE_VALUES,
  AUDIENCE_VALUES,
  CONTENT_FORMAT_VALUES,
  RELEASE_DATE_RE,
  SLUG_RE,
} from '../../catalogue/classification/taxonomy.constants';
import type { ClassificationInput } from '../../catalogue/classification/classification.service';

/** Present (not undefined); `null` still reaches the other validators. */
const isPresent = (_: unknown, v: unknown) => v !== undefined;

const HOME_SORT_VALUES: HomeSort[] = [
  'POPULARITY',
  'PUBLISHED_DESC',
  'RELEASE_DESC',
  'RELEASE_ASC',
  'RATING_DESC',
  'PLAYS_1D',
  'PLAYS_7D',
  'PLAYS_ALL',
  'LATEST_EPISODE',
  'EXPIRING_SOON',
  'MANUAL',
];

/**
 * PUT /v1/admin/titles/:id/classification. `undefined` = unchanged,
 * `null` = clear (nullable fields only; list fields take `[]` to clear).
 */
export class UpdateClassificationDto implements ClassificationInput {
  @IsOptional()
  @IsIn(CONTENT_FORMAT_VALUES)
  contentFormat?: ContentFormat | null;

  @ValidateIf(isPresent)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  genres?: string[];

  @ValidateIf(isPresent)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  tags?: string[];

  @ValidateIf(isPresent)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  collections?: string[];

  @ValidateIf(isPresent)
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  industries?: string[];

  @IsOptional()
  @IsIn(AUDIENCE_VALUES)
  audience?: Audience | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ageRating?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ratingJurisdiction?: string | null;

  @IsOptional()
  @Matches(RELEASE_DATE_RE, { message: 'releaseDate must be YYYY-MM-DD' })
  releaseDate?: string | null;

  @IsOptional()
  @IsIn(ACCESS_TYPE_VALUES)
  accessType?: AccessType | null;

  /** ISO 3166-1 alpha-2; upper-cased by the server. */
  @ValidateIf(isPresent)
  @IsArray()
  @ArrayMaxSize(60)
  @Matches(/^[A-Za-z]{2}$/, { each: true, message: 'productionCountries must be 2-letter codes' })
  productionCountries?: string[];

  /** 2–3 letter codes; lower-cased by the server. */
  @ValidateIf(isPresent)
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(/^[A-Za-z]{2,3}$/, { each: true, message: 'originalLanguages must be 2–3 letter codes' })
  originalLanguages?: string[];

  @ValidateIf(isPresent)
  @IsArray()
  @ArrayMaxSize(30)
  @Matches(/^[A-Za-z]{2,3}$/, { each: true, message: 'audioLanguages must be 2–3 letter codes' })
  audioLanguages?: string[];

  @IsOptional()
  @IsISO8601()
  availableFrom?: string | null;

  @IsOptional()
  @IsISO8601()
  availableUntil?: string | null;

  @ValidateIf(isPresent)
  @IsBoolean()
  seriesComplete?: boolean;
}

/** PATCH /v1/admin/home-sections/:id. */
export class UpdateHomeSectionDto {
  @ValidateIf(isPresent)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title?: string;

  @ValidateIf(isPresent)
  @IsBoolean()
  enabled?: boolean;

  @ValidateIf(isPresent)
  @IsIn(HOME_SORT_VALUES)
  sort?: HomeSort;

  @ValidateIf(isPresent)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ValidateIf(isPresent)
  @IsInt()
  @Min(1)
  @Max(50)
  minItems?: number;

  /** SectionRules JSON; validated by `parseSectionRules`. */
  @ValidateIf(isPresent)
  @IsObject()
  rules?: Record<string, unknown>;

  @ValidateIf(isPresent)
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  pinnedTitleIds?: string[];

  @ValidateIf(isPresent)
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  excludedTitleIds?: string[];
}

/** PUT /v1/admin/home-sections/order — every section id exactly once. */
export class ReorderHomeSectionsDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

/** POST /v1/admin/collections (always EDITORIAL). */
export class CreateCollectionDto {
  @IsString()
  @MaxLength(60)
  @Matches(SLUG_RE, { message: 'slug must be lower-case words joined by hyphens' })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

/** PATCH /v1/admin/collections/:slug. */
export class UpdateCollectionDto {
  @ValidateIf(isPresent)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
