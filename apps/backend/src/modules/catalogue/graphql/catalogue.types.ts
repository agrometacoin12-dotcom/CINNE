import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class TitleSummaryType {
  @Field() id!: string;
  @Field() type!: string;
  @Field() title!: string;
  @Field(() => Int) year!: number;
  @Field(() => Float) rating!: number;
  @Field(() => [String]) genres!: string[];
  @Field(() => String, { nullable: true }) posterUrl!: string | null;
}

@ObjectType()
export class TitleType extends TitleSummaryType {
  @Field(() => String, { nullable: true }) tagline!: string | null;
  @Field() overview!: string;
  @Field(() => Int, { nullable: true }) runtimeMinutes!: number | null;
  @Field(() => Int, { nullable: true }) seasons!: number | null;
  @Field(() => String, { nullable: true }) maturityRating!: string | null;
  @Field(() => String, { nullable: true }) heroUrl!: string | null;
  @Field(() => [String]) cast!: string[];
  @Field(() => String, { nullable: true }) director!: string | null;
  @Field(() => [String]) categories!: string[];
}

@ObjectType()
export class BrowseRowType {
  @Field() slug!: string;
  @Field() title!: string;
  @Field(() => [TitleSummaryType]) items!: TitleSummaryType[];
}

@ObjectType()
export class BrowseResponseType {
  @Field(() => TitleType, { nullable: true }) hero!: TitleType | null;
  @Field(() => [BrowseRowType]) rows!: BrowseRowType[];
}

@ObjectType()
export class SearchResponseType {
  @Field() query!: string;
  @Field(() => [TitleSummaryType]) results!: TitleSummaryType[];
}
