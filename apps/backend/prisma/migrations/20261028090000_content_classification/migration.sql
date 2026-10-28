-- Content classification & rule-based homepage (docs/content-classification.md).
-- Part 1 is Prisma-generated DDL; part 2 backfills, seeds vocabularies and
-- homepage sections (idempotent: ON CONFLICT (slug) DO NOTHING) and maps the
-- legacy free-text genres/categories onto the new join tables.

-- ═══ Part 1: schema ═══════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('FEATURE_FILM', 'SHORT_FILM', 'TV_SERIES', 'LIMITED_SERIES', 'MINISERIES', 'DOCUMENTARY_FILM', 'DOCUMENTARY_SERIES', 'ANIMATION_FILM', 'ANIMATED_SERIES', 'STANDUP_COMEDY', 'LIVE_PERFORMANCE', 'SPECIAL', 'ANTHOLOGY', 'REALITY_SERIES', 'MUSIC_FILM');

-- CreateEnum
CREATE TYPE "Audience" AS ENUM ('KIDS', 'TEENS', 'FAMILY', 'ADULTS');

-- CreateEnum
CREATE TYPE "AccessType" AS ENUM ('FREE', 'SUBSCRIPTION', 'PAY_PER_VIEW', 'RENTAL', 'PURCHASE', 'PROMOTIONAL');

-- CreateEnum
CREATE TYPE "TagKind" AS ENUM ('MOOD', 'THEME', 'SETTING', 'CHARACTER', 'STORY');

-- CreateEnum
CREATE TYPE "CollectionKind" AS ENUM ('EDITORIAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ClassificationSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "HomeSectionKind" AS ENUM ('RULE', 'CONTINUE_WATCHING', 'WATCHLIST', 'RECOMMENDED', 'BECAUSE_YOU_WATCHED');

-- CreateEnum
CREATE TYPE "HomeSort" AS ENUM ('POPULARITY', 'PUBLISHED_DESC', 'RELEASE_DESC', 'RELEASE_ASC', 'RATING_DESC', 'PLAYS_1D', 'PLAYS_7D', 'PLAYS_ALL', 'LATEST_EPISODE', 'EXPIRING_SOON', 'MANUAL');

-- DropForeignKey (pre-existing drift: schema has ON UPDATE CASCADE)
ALTER TABLE "korapay_test_topups" DROP CONSTRAINT "korapay_test_topups_user_id_fkey";

-- AlterTable
ALTER TABLE "catalogue_titles" ADD COLUMN     "access_type" "AccessType",
ADD COLUMN     "age_rating" TEXT,
ADD COLUMN     "audience" "Audience",
ADD COLUMN     "audio_languages" TEXT[],
ADD COLUMN     "available_from" TIMESTAMP(3),
ADD COLUMN     "available_until" TIMESTAMP(3),
ADD COLUMN     "content_format" "ContentFormat",
ADD COLUMN     "original_languages" TEXT[],
ADD COLUMN     "production_countries" TEXT[],
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "rating_jurisdiction" TEXT,
ADD COLUMN     "release_date" DATE,
ADD COLUMN     "series_complete" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "genres" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TagKind" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industries" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "countries" TEXT[],
    "languages" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CollectionKind" NOT NULL DEFAULT 'EDITORIAL',
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_genres" (
    "title_id" UUID NOT NULL,
    "genre_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "title_genres_pkey" PRIMARY KEY ("title_id","genre_id")
);

-- CreateTable
CREATE TABLE "title_tags" (
    "title_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "title_tags_pkey" PRIMARY KEY ("title_id","tag_id")
);

-- CreateTable
CREATE TABLE "title_industries" (
    "title_id" UUID NOT NULL,
    "industry_id" UUID NOT NULL,
    "source" "ClassificationSource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "title_industries_pkey" PRIMARY KEY ("title_id","industry_id")
);

-- CreateTable
CREATE TABLE "title_collections" (
    "title_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "title_collections_pkey" PRIMARY KEY ("title_id","collection_id")
);

-- CreateTable
CREATE TABLE "homepage_sections" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "HomeSectionKind" NOT NULL DEFAULT 'RULE',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "sort" "HomeSort" NOT NULL DEFAULT 'POPULARITY',
    "limit" INTEGER NOT NULL DEFAULT 20,
    "min_items" INTEGER NOT NULL DEFAULT 4,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "pinned_title_ids" TEXT[],
    "excluded_title_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homepage_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");

-- CreateIndex
CREATE INDEX "genres_parent_id_idx" ON "genres"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE INDEX "tags_kind_idx" ON "tags"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "industries_slug_key" ON "industries"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE INDEX "title_genres_genre_id_idx" ON "title_genres"("genre_id");

-- CreateIndex
CREATE INDEX "title_tags_tag_id_idx" ON "title_tags"("tag_id");

-- CreateIndex
CREATE INDEX "title_industries_industry_id_idx" ON "title_industries"("industry_id");

-- CreateIndex
CREATE INDEX "title_collections_collection_id_idx" ON "title_collections"("collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "homepage_sections_slug_key" ON "homepage_sections"("slug");

-- CreateIndex
CREATE INDEX "homepage_sections_enabled_position_idx" ON "homepage_sections"("enabled", "position");

-- AddForeignKey
ALTER TABLE "korapay_test_topups" ADD CONSTRAINT "korapay_test_topups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genres" ADD CONSTRAINT "genres_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_genres" ADD CONSTRAINT "title_genres_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "catalogue_titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_genres" ADD CONSTRAINT "title_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_tags" ADD CONSTRAINT "title_tags_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "catalogue_titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_tags" ADD CONSTRAINT "title_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_industries" ADD CONSTRAINT "title_industries_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "catalogue_titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_industries" ADD CONSTRAINT "title_industries_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_collections" ADD CONSTRAINT "title_collections_title_id_fkey" FOREIGN KEY ("title_id") REFERENCES "catalogue_titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_collections" ADD CONSTRAINT "title_collections_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══ Part 2: data ═════════════════════════════════════════════════════════

-- ─── Backfill ──────────────────────────────────────────────────────────────
-- Titles that are already published count as published at their last update.
UPDATE "catalogue_titles" SET "published_at" = "updated_at" WHERE "status" = 'PUBLISHED' AND "published_at" IS NULL;

-- New list columns start empty (not NULL) for existing rows.
UPDATE "catalogue_titles" SET "production_countries" = '{}' WHERE "production_countries" IS NULL;
UPDATE "catalogue_titles" SET "original_languages" = '{}' WHERE "original_languages" IS NULL;
UPDATE "catalogue_titles" SET "audio_languages" = '{}' WHERE "audio_languages" IS NULL;

-- ─── Genres (30 top-level) and subgenres ("<parent>-<sub>") ──────────────────
INSERT INTO "genres" ("id", "slug", "name", "parent_id", "position") VALUES
  (gen_random_uuid(), 'action', 'Action', NULL, 0),
  (gen_random_uuid(), 'adventure', 'Adventure', NULL, 1),
  (gen_random_uuid(), 'comedy', 'Comedy', NULL, 2),
  (gen_random_uuid(), 'drama', 'Drama', NULL, 3),
  (gen_random_uuid(), 'romance', 'Romance', NULL, 4),
  (gen_random_uuid(), 'horror', 'Horror', NULL, 5),
  (gen_random_uuid(), 'thriller', 'Thriller', NULL, 6),
  (gen_random_uuid(), 'science-fiction', 'Science Fiction', NULL, 7),
  (gen_random_uuid(), 'fantasy', 'Fantasy', NULL, 8),
  (gen_random_uuid(), 'crime', 'Crime', NULL, 9),
  (gen_random_uuid(), 'mystery', 'Mystery', NULL, 10),
  (gen_random_uuid(), 'documentary', 'Documentary', NULL, 11),
  (gen_random_uuid(), 'animation', 'Animation', NULL, 12),
  (gen_random_uuid(), 'family', 'Family', NULL, 13),
  (gen_random_uuid(), 'musical', 'Musical', NULL, 14),
  (gen_random_uuid(), 'biography', 'Biography', NULL, 15),
  (gen_random_uuid(), 'history', 'History', NULL, 16),
  (gen_random_uuid(), 'war', 'War', NULL, 17),
  (gen_random_uuid(), 'western', 'Western', NULL, 18),
  (gen_random_uuid(), 'sports', 'Sports', NULL, 19),
  (gen_random_uuid(), 'faith-spirituality', 'Faith & Spirituality', NULL, 20),
  (gen_random_uuid(), 'politics', 'Politics', NULL, 21),
  (gen_random_uuid(), 'psychological', 'Psychological', NULL, 22),
  (gen_random_uuid(), 'disaster', 'Disaster', NULL, 23),
  (gen_random_uuid(), 'superhero', 'Superhero', NULL, 24),
  (gen_random_uuid(), 'teen-young-adult', 'Teen & Young Adult', NULL, 25),
  (gen_random_uuid(), 'educational', 'Educational', NULL, 26),
  (gen_random_uuid(), 'experimental', 'Experimental', NULL, 27),
  (gen_random_uuid(), 'film-noir', 'Film Noir', NULL, 28),
  (gen_random_uuid(), 'reality-unscripted', 'Reality & Unscripted', NULL, 29)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "genres" ("id", "slug", "name", "parent_id", "position")
SELECT gen_random_uuid(), v.slug, v.name, p."id", v.position
FROM (VALUES
  ('action-martial-arts', 'Martial Arts', 'action', 0),
  ('action-military', 'Military', 'action', 1),
  ('action-gunfights', 'Gunfights', 'action', 2),
  ('action-superheroes', 'Superheroes', 'action', 3),
  ('adventure-jungle', 'Jungle', 'adventure', 0),
  ('adventure-survival', 'Survival', 'adventure', 1),
  ('adventure-treasure-hunt', 'Treasure Hunt', 'adventure', 2),
  ('adventure-exploration', 'Exploration', 'adventure', 3),
  ('comedy-romantic-comedy', 'Romantic Comedy', 'comedy', 0),
  ('comedy-dark-comedy', 'Dark Comedy', 'comedy', 1),
  ('comedy-satire', 'Satire', 'comedy', 2),
  ('comedy-slapstick', 'Slapstick', 'comedy', 3),
  ('drama-family-drama', 'Family Drama', 'drama', 0),
  ('drama-social-drama', 'Social Drama', 'drama', 1),
  ('drama-political-drama', 'Political Drama', 'drama', 2),
  ('romance-romantic-drama', 'Romantic Drama', 'romance', 0),
  ('romance-teen-romance', 'Teen Romance', 'romance', 1),
  ('romance-historical-romance', 'Historical Romance', 'romance', 2),
  ('horror-supernatural', 'Supernatural', 'horror', 0),
  ('horror-slasher', 'Slasher', 'horror', 1),
  ('horror-psychological', 'Psychological', 'horror', 2),
  ('horror-paranormal', 'Paranormal', 'horror', 3),
  ('thriller-psychological', 'Psychological', 'thriller', 0),
  ('thriller-conspiracy', 'Conspiracy', 'thriller', 1),
  ('thriller-mystery', 'Mystery', 'thriller', 2),
  ('thriller-survival', 'Survival', 'thriller', 3),
  ('science-fiction-space', 'Space', 'science-fiction', 0),
  ('science-fiction-ai', 'AI', 'science-fiction', 1),
  ('science-fiction-time-travel', 'Time Travel', 'science-fiction', 2),
  ('science-fiction-cyberpunk', 'Cyberpunk', 'science-fiction', 3),
  ('science-fiction-dystopian', 'Dystopian', 'science-fiction', 4),
  ('fantasy-magic', 'Magic', 'fantasy', 0),
  ('fantasy-mythology', 'Mythology', 'fantasy', 1),
  ('fantasy-epic-fantasy', 'Epic Fantasy', 'fantasy', 2),
  ('fantasy-urban-fantasy', 'Urban Fantasy', 'fantasy', 3),
  ('crime-gangster', 'Gangster', 'crime', 0),
  ('crime-detective', 'Detective', 'crime', 1),
  ('crime-heist', 'Heist', 'crime', 2),
  ('crime-organized-crime', 'Organized Crime', 'crime', 3),
  ('mystery-whodunit', 'Whodunit', 'mystery', 0),
  ('mystery-detective', 'Detective', 'mystery', 1),
  ('mystery-suspense', 'Suspense', 'mystery', 2),
  ('mystery-unsolved-cases', 'Unsolved Cases', 'mystery', 3),
  ('documentary-nature', 'Nature', 'documentary', 0),
  ('documentary-biography', 'Biography', 'documentary', 1),
  ('documentary-investigative', 'Investigative', 'documentary', 2),
  ('documentary-historical', 'Historical', 'documentary', 3),
  ('animation-2d', '2D', 'animation', 0),
  ('animation-3d', '3D', 'animation', 1),
  ('animation-anime', 'Anime', 'animation', 2),
  ('animation-stop-motion', 'Stop Motion', 'animation', 3),
  ('family-family-adventure', 'Family Adventure', 'family', 0),
  ('family-family-comedy', 'Family Comedy', 'family', 1),
  ('family-inspirational', 'Inspirational', 'family', 2),
  ('musical-music-drama', 'Music Drama', 'musical', 0),
  ('musical-dance', 'Dance', 'musical', 1),
  ('musical-broadway-style', 'Broadway-style', 'musical', 2),
  ('biography-biographical-drama', 'Biographical Drama', 'biography', 0),
  ('biography-biopic', 'Biopic', 'biography', 1),
  ('history-historical-drama', 'Historical Drama', 'history', 0),
  ('history-period-film', 'Period Film', 'history', 1),
  ('war-military', 'Military', 'war', 0),
  ('war-world-wars', 'World Wars', 'war', 1),
  ('war-civil-war', 'Civil War', 'war', 2),
  ('western-classic-western', 'Classic Western', 'western', 0),
  ('western-neo-western', 'Neo-Western', 'western', 1),
  ('sports-football', 'Football', 'sports', 0),
  ('sports-boxing', 'Boxing', 'sports', 1),
  ('sports-racing', 'Racing', 'sports', 2),
  ('sports-basketball', 'Basketball', 'sports', 3),
  ('faith-spirituality-christian', 'Christian', 'faith-spirituality', 0),
  ('faith-spirituality-islamic', 'Islamic', 'faith-spirituality', 1),
  ('faith-spirituality-inspirational', 'Inspirational', 'faith-spirituality', 2),
  ('faith-spirituality-biblical', 'Biblical', 'faith-spirituality', 3),
  ('politics-political-drama', 'Political Drama', 'politics', 0),
  ('politics-political-thriller', 'Political Thriller', 'politics', 1),
  ('psychological-mind-games', 'Mind Games', 'psychological', 0),
  ('psychological-psychological-drama', 'Psychological Drama', 'psychological', 1),
  ('disaster-earthquakes', 'Earthquakes', 'disaster', 0),
  ('disaster-floods', 'Floods', 'disaster', 1),
  ('disaster-apocalyptic', 'Apocalyptic', 'disaster', 2),
  ('superhero-marvel-style', 'Marvel-style', 'superhero', 0),
  ('superhero-dc-style', 'DC-style', 'superhero', 1),
  ('superhero-original-heroes', 'Original Heroes', 'superhero', 2),
  ('teen-young-adult-coming-of-age', 'Coming-of-Age', 'teen-young-adult', 0),
  ('teen-young-adult-school', 'School', 'teen-young-adult', 1),
  ('teen-young-adult-teen-drama', 'Teen Drama', 'teen-young-adult', 2),
  ('educational-science', 'Science', 'educational', 0),
  ('educational-learning', 'Learning', 'educational', 1),
  ('educational-academic', 'Academic', 'educational', 2),
  ('experimental-avant-garde', 'Avant-Garde', 'experimental', 0),
  ('experimental-art-house', 'Art House', 'experimental', 1),
  ('film-noir-classic-noir', 'Classic Noir', 'film-noir', 0),
  ('film-noir-neo-noir', 'Neo-Noir', 'film-noir', 1),
  ('reality-unscripted-reality-shows', 'Reality Shows', 'reality-unscripted', 0),
  ('reality-unscripted-competitions', 'Competitions', 'reality-unscripted', 1),
  ('reality-unscripted-lifestyle', 'Lifestyle', 'reality-unscripted', 2)
) AS v(slug, name, parent_slug, position)
JOIN "genres" p ON p."slug" = v.parent_slug
ON CONFLICT ("slug") DO NOTHING;

-- ─── Tags ───────────────────────────────────────────────────────────────────
INSERT INTO "tags" ("id", "slug", "name", "kind", "position") VALUES
  (gen_random_uuid(), 'feel-good', 'Feel-Good', 'MOOD', 0),
  (gen_random_uuid(), 'emotional', 'Emotional', 'MOOD', 1),
  (gen_random_uuid(), 'dark', 'Dark', 'MOOD', 2),
  (gen_random_uuid(), 'suspenseful', 'Suspenseful', 'MOOD', 3),
  (gen_random_uuid(), 'heartwarming', 'Heartwarming', 'MOOD', 4),
  (gen_random_uuid(), 'intense', 'Intense', 'MOOD', 5),
  (gen_random_uuid(), 'funny', 'Funny', 'MOOD', 6),
  (gen_random_uuid(), 'romantic', 'Romantic', 'MOOD', 7),
  (gen_random_uuid(), 'inspirational', 'Inspirational', 'MOOD', 8),
  (gen_random_uuid(), 'relaxing', 'Relaxing', 'MOOD', 9),
  (gen_random_uuid(), 'thought-provoking', 'Thought-Provoking', 'MOOD', 10),
  (gen_random_uuid(), 'scary', 'Scary', 'MOOD', 11),
  (gen_random_uuid(), 'uplifting', 'Uplifting', 'MOOD', 12),
  (gen_random_uuid(), 'gritty', 'Gritty', 'MOOD', 13),
  (gen_random_uuid(), 'betrayal', 'Betrayal', 'THEME', 0),
  (gen_random_uuid(), 'revenge', 'Revenge', 'THEME', 1),
  (gen_random_uuid(), 'family-conflict', 'Family Conflict', 'THEME', 2),
  (gen_random_uuid(), 'friendship', 'Friendship', 'THEME', 3),
  (gen_random_uuid(), 'marriage', 'Marriage', 'THEME', 4),
  (gen_random_uuid(), 'infidelity', 'Infidelity', 'THEME', 5),
  (gen_random_uuid(), 'redemption', 'Redemption', 'THEME', 6),
  (gen_random_uuid(), 'justice', 'Justice', 'THEME', 7),
  (gen_random_uuid(), 'corruption', 'Corruption', 'THEME', 8),
  (gen_random_uuid(), 'wealth', 'Wealth', 'THEME', 9),
  (gen_random_uuid(), 'poverty', 'Poverty', 'THEME', 10),
  (gen_random_uuid(), 'power', 'Power', 'THEME', 11),
  (gen_random_uuid(), 'survival', 'Survival', 'THEME', 12),
  (gen_random_uuid(), 'jealousy', 'Jealousy', 'THEME', 13),
  (gen_random_uuid(), 'ambition', 'Ambition', 'THEME', 14),
  (gen_random_uuid(), 'tradition', 'Tradition', 'THEME', 15),
  (gen_random_uuid(), 'spirituality', 'Spirituality', 'THEME', 16),
  (gen_random_uuid(), 'parenthood', 'Parenthood', 'THEME', 17),
  (gen_random_uuid(), 'coming-of-age', 'Coming of Age', 'THEME', 18),
  (gen_random_uuid(), 'school-campus', 'School & Campus', 'SETTING', 0),
  (gen_random_uuid(), 'village', 'Village', 'SETTING', 1),
  (gen_random_uuid(), 'royalty', 'Royalty & Kingdoms', 'SETTING', 2),
  (gen_random_uuid(), 'wedding', 'Wedding', 'SETTING', 3),
  (gen_random_uuid(), 'city-life', 'City Life', 'SETTING', 4),
  (gen_random_uuid(), 'strong-female-lead', 'Strong Female Lead', 'CHARACTER', 0),
  (gen_random_uuid(), 'true-story', 'Based on a True Story', 'STORY', 0),
  (gen_random_uuid(), 'true-crime', 'True Crime', 'STORY', 1)
ON CONFLICT ("slug") DO NOTHING;

-- ─── Industries (countries/languages drive AUTO assignment) ─────────────────
INSERT INTO "industries" ("id", "slug", "name", "position", "countries", "languages") VALUES
  (gen_random_uuid(), 'nollywood', 'Nollywood', 0, ARRAY['NG']::text[], '{}'::text[]),
  (gen_random_uuid(), 'ghallywood', 'Ghallywood', 1, ARRAY['GH']::text[], '{}'::text[]),
  (gen_random_uuid(), 'bollywood', 'Bollywood', 2, ARRAY['IN']::text[], ARRAY['hi']::text[]),
  (gen_random_uuid(), 'hollywood', 'Hollywood', 3, ARRAY['US']::text[], '{}'::text[]),
  (gen_random_uuid(), 'kannywood', 'Kannywood', 4, ARRAY['NG']::text[], ARRAY['ha']::text[]),
  (gen_random_uuid(), 'yoruba-cinema', 'Yoruba Cinema', 5, '{}'::text[], ARRAY['yo']::text[]),
  (gen_random_uuid(), 'igbo-cinema', 'Igbo Cinema', 6, '{}'::text[], ARRAY['ig']::text[]),
  (gen_random_uuid(), 'south-african-cinema', 'South African Cinema', 7, ARRAY['ZA']::text[], '{}'::text[]),
  (gen_random_uuid(), 'african-cinema', 'African Cinema', 8, ARRAY['DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'CF', 'TD', 'KM', 'CG', 'CD', 'CI', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'ST', 'SN', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW']::text[], '{}'::text[]),
  (gen_random_uuid(), 'korean-cinema', 'Korean Cinema', 9, ARRAY['KR']::text[], '{}'::text[]),
  (gen_random_uuid(), 'japanese-cinema', 'Japanese Cinema', 10, ARRAY['JP']::text[], '{}'::text[]),
  (gen_random_uuid(), 'chinese-cinema', 'Chinese Cinema', 11, ARRAY['CN', 'HK', 'TW']::text[], '{}'::text[]),
  (gen_random_uuid(), 'european-cinema', 'European Cinema', 12, ARRAY['AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'UK', 'VA']::text[], '{}'::text[]),
  (gen_random_uuid(), 'latin-american-cinema', 'Latin American Cinema', 13, ARRAY['MX', 'BZ', 'GT', 'SV', 'HN', 'NI', 'CR', 'PA', 'CO', 'VE', 'EC', 'PE', 'BO', 'BR', 'PY', 'CL', 'AR', 'UY', 'GY', 'SR', 'GF', 'CU', 'DO', 'PR']::text[], '{}'::text[]),
  (gen_random_uuid(), 'middle-eastern-cinema', 'Middle Eastern Cinema', 14, ARRAY['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'YE', 'IQ', 'IR', 'IL', 'PS', 'JO', 'LB', 'SY', 'TR', 'EG']::text[], '{}'::text[]),
  (gen_random_uuid(), 'international-cinema', 'International Cinema', 15, '{}'::text[], '{}'::text[])
ON CONFLICT ("slug") DO NOTHING;

-- ─── Collections (EDITORIAL + legacy SYSTEM browse rows) ────────────────────
INSERT INTO "collections" ("id", "slug", "name", "kind", "position") VALUES
  (gen_random_uuid(), 'editors-picks', 'Editor''s Picks', 'EDITORIAL', 0),
  (gen_random_uuid(), 'cinnetemple-originals', 'CinneTemple Originals', 'EDITORIAL', 1),
  (gen_random_uuid(), 'exclusive-premieres', 'Exclusive Premieres', 'EDITORIAL', 2),
  (gen_random_uuid(), 'weekend-picks', 'Weekend Movie Picks', 'EDITORIAL', 3),
  (gen_random_uuid(), 'award-winning', 'Award-Winning Movies', 'EDITORIAL', 4),
  (gen_random_uuid(), 'critically-acclaimed', 'Critically Acclaimed', 'EDITORIAL', 5),
  (gen_random_uuid(), 'hidden-gems', 'Hidden Gems', 'EDITORIAL', 6),
  (gen_random_uuid(), 'classic-cinema', 'Classic Cinema', 'EDITORIAL', 7),
  (gen_random_uuid(), 'throwback-favorites', 'Throwback Favorites', 'EDITORIAL', 8),
  (gen_random_uuid(), 'new-listings', 'New Listings', 'SYSTEM', 9),
  (gen_random_uuid(), 'trending', 'Trending now', 'SYSTEM', 10),
  (gen_random_uuid(), 'most-watched', 'Most watched', 'SYSTEM', 11),
  (gen_random_uuid(), 'coming-soon', 'Coming soon', 'SYSTEM', 12),
  (gen_random_uuid(), 'new-releases', 'New releases', 'SYSTEM', 13),
  (gen_random_uuid(), 'acclaimed', 'Acclaimed (legacy row)', 'SYSTEM', 14),
  (gen_random_uuid(), 'series', 'Binge-worthy series', 'SYSTEM', 15)
ON CONFLICT ("slug") DO NOTHING;

-- ─── Homepage sections (51, in position order) ──────────────────────────────
INSERT INTO "homepage_sections" ("id", "slug", "title", "kind", "rules", "sort", "limit", "min_items", "enabled", "position", "pinned_title_ids", "excluded_title_ids", "updated_at") VALUES
  (gen_random_uuid(), 'continue-watching', 'Continue Watching', 'CONTINUE_WATCHING', '{}'::jsonb, 'POPULARITY', 20, 1, true, 0, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'newly-added', 'Newly Added', 'RULE', '{}'::jsonb, 'PUBLISHED_DESC', 20, 1, true, 1, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'trending-now', 'Trending Now', 'RULE', '{"anyOf":[{"collectionsAny":["trending"]},{"minPlays7d":1}]}'::jsonb, 'PLAYS_7D', 20, 4, true, 2, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'top-10-week', 'Top 10 This Week', 'RULE', '{"minPlays7d":1}'::jsonb, 'PLAYS_7D', 10, 5, true, 3, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'exclusive-premieres', 'Exclusive Premieres', 'RULE', '{"anyOf":[{"collectionsAny":["exclusive-premieres"]},{"premiere":true}]}'::jsonb, 'RELEASE_DESC', 20, 1, true, 4, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'coming-soon', 'Coming Soon', 'RULE', '{"anyOf":[{"upcoming":true},{"collectionsAny":["coming-soon"]}]}'::jsonb, 'RELEASE_ASC', 20, 1, true, 5, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'nollywood-blockbusters', 'Nollywood Blockbusters', 'RULE', '{"industriesAny":["nollywood"]}'::jsonb, 'POPULARITY', 20, 4, true, 6, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'action-packed', 'Action-Packed Movies', 'RULE', '{"genresAny":["action"]}'::jsonb, 'POPULARITY', 20, 4, true, 7, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'laugh-out-loud', 'Laugh Out Loud', 'RULE', '{"genresAny":["comedy"]}'::jsonb, 'POPULARITY', 20, 4, true, 8, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'love-romance', 'Love & Romance', 'RULE', '{"genresAny":["romance"]}'::jsonb, 'POPULARITY', 20, 4, true, 9, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'thrillers', 'Edge-of-Your-Seat Thrillers', 'RULE', '{"genresAny":["thriller"]}'::jsonb, 'POPULARITY', 20, 4, true, 10, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'binge-worthy-series', 'Binge-Worthy Series', 'RULE', '{"types":["series"]}'::jsonb, 'POPULARITY', 20, 2, true, 11, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'recently-added-episodes', 'Recently Added Episodes', 'RULE', '{"types":["series"],"hasEpisodeWithinDays":30}'::jsonb, 'LATEST_EPISODE', 20, 2, true, 12, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'family-movie-night', 'Family Movie Night', 'RULE', '{"anyOf":[{"genresAny":["family"]},{"audiencesAny":["FAMILY","KIDS"]}]}'::jsonb, 'POPULARITY', 20, 4, true, 13, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'free-to-watch', 'Free to Watch', 'RULE', '{"accessAny":["FREE","PROMOTIONAL"]}'::jsonb, 'POPULARITY', 20, 2, true, 14, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'african-stories', 'African Stories', 'RULE', '{"industriesAny":["african-cinema"]}'::jsonb, 'POPULARITY', 20, 4, true, 15, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'editors-picks', 'Editor''s Picks', 'RULE', '{"collectionsAny":["editors-picks"]}'::jsonb, 'MANUAL', 20, 3, true, 16, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'your-watchlist', 'Your Watchlist', 'WATCHLIST', '{}'::jsonb, 'POPULARITY', 20, 1, true, 17, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'latest-releases', 'Latest Releases', 'RULE', '{"anyOf":[{"releasedWithinDays":365},{"collectionsAny":["new-releases"]}]}'::jsonb, 'RELEASE_DESC', 20, 4, true, 18, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'top-10-today', 'Top 10 Movies Today', 'RULE', '{"types":["movie"],"minPlays1d":1}'::jsonb, 'PLAYS_1D', 10, 5, true, 19, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'most-watched', 'Most Watched', 'RULE', '{"anyOf":[{"collectionsAny":["most-watched"]},{"minPlaysAll":1}]}'::jsonb, 'PLAYS_ALL', 20, 4, true, 20, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'popular', 'Popular on CinneTemple', 'RULE', '{}'::jsonb, 'POPULARITY', 20, 8, true, 21, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'recommended', 'Recommended for You', 'RECOMMENDED', '{}'::jsonb, 'POPULARITY', 20, 4, false, 22, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'because-you-watched', 'Because You Watched…', 'BECAUSE_YOU_WATCHED', '{}'::jsonb, 'POPULARITY', 20, 4, false, 23, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'cinnetemple-originals', 'CinneTemple Originals', 'RULE', '{"collectionsAny":["cinnetemple-originals"]}'::jsonb, 'MANUAL', 20, 3, true, 24, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'horror-nights', 'Horror Nights', 'RULE', '{"genresAny":["horror"]}'::jsonb, 'POPULARITY', 20, 4, true, 25, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'crime-investigation', 'Crime & Investigation', 'RULE', '{"anyOf":[{"genresAny":["crime","mystery"]},{"tagsAny":["true-crime"]}]}'::jsonb, 'POPULARITY', 20, 4, true, 26, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'faith-inspiration', 'Faith & Inspiration', 'RULE', '{"anyOf":[{"genresAny":["faith-spirituality"]},{"tagsAny":["inspirational","spirituality"]}]}'::jsonb, 'POPULARITY', 20, 4, true, 27, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'based-on-true-stories', 'Based on True Stories', 'RULE', '{"tagsAny":["true-story"]}'::jsonb, 'POPULARITY', 20, 4, true, 28, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'hollywood-hits', 'Hollywood Hits', 'RULE', '{"industriesAny":["hollywood"]}'::jsonb, 'POPULARITY', 20, 4, true, 29, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'korean-dramas', 'Korean Dramas', 'RULE', '{"industriesAny":["korean-cinema"],"genresAny":["drama"]}'::jsonb, 'POPULARITY', 20, 4, true, 30, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'bollywood-favorites', 'Bollywood Favorites', 'RULE', '{"industriesAny":["bollywood"]}'::jsonb, 'POPULARITY', 20, 4, true, 31, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'award-winning', 'Award-Winning Movies', 'RULE', '{"collectionsAny":["award-winning"]}'::jsonb, 'MANUAL', 20, 3, true, 32, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'critically-acclaimed', 'Critically Acclaimed', 'RULE', '{"collectionsAny":["critically-acclaimed","acclaimed"]}'::jsonb, 'RATING_DESC', 20, 3, true, 33, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'hidden-gems', 'Hidden Gems', 'RULE', '{"collectionsAny":["hidden-gems"]}'::jsonb, 'MANUAL', 20, 3, true, 34, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'weekend-picks', 'Weekend Movie Picks', 'RULE', '{"collectionsAny":["weekend-picks"]}'::jsonb, 'MANUAL', 20, 3, true, 35, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'under-90-minutes', 'Movies Under 90 Minutes', 'RULE', '{"types":["movie"],"maxRuntimeMinutes":90}'::jsonb, 'POPULARITY', 20, 4, true, 36, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'epic-movies', 'Epic Movies', 'RULE', '{"types":["movie"],"minRuntimeMinutes":150}'::jsonb, 'POPULARITY', 20, 4, true, 37, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'complete-series', 'Complete Series', 'RULE', '{"types":["series"],"seriesComplete":true}'::jsonb, 'POPULARITY', 20, 3, true, 38, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'classic-cinema', 'Classic Cinema', 'RULE', '{"collectionsAny":["classic-cinema"]}'::jsonb, 'RELEASE_ASC', 20, 3, true, 39, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'throwback-favorites', 'Throwback Favorites', 'RULE', '{"anyOf":[{"collectionsAny":["throwback-favorites"]},{"releaseYearMin":1990,"releaseYearMax":2010}]}'::jsonb, 'POPULARITY', 20, 4, true, 40, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'strong-female-leads', 'Strong Female Leads', 'RULE', '{"tagsAny":["strong-female-lead"]}'::jsonb, 'POPULARITY', 20, 4, true, 41, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'supernatural-stories', 'Supernatural Stories', 'RULE', '{"genresAny":["horror-supernatural","horror-paranormal"]}'::jsonb, 'POPULARITY', 20, 4, true, 42, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'high-school-campus', 'High School & Campus', 'RULE', '{"anyOf":[{"tagsAny":["school-campus"]},{"genresAny":["teen-young-adult-school"]}]}'::jsonb, 'POPULARITY', 20, 4, true, 43, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'weddings-relationships', 'Weddings & Relationships', 'RULE', '{"tagsAny":["wedding","marriage","infidelity"]}'::jsonb, 'POPULARITY', 20, 4, true, 44, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'royalty-kingdoms', 'Royalty & Kingdoms', 'RULE', '{"tagsAny":["royalty"]}'::jsonb, 'POPULARITY', 20, 4, true, 45, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'village-stories', 'Village Stories', 'RULE', '{"tagsAny":["village"]}'::jsonb, 'POPULARITY', 20, 4, true, 46, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'revenge-betrayal', 'Revenge & Betrayal', 'RULE', '{"tagsAny":["revenge","betrayal"]}'::jsonb, 'POPULARITY', 20, 4, true, 47, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'money-power-ambition', 'Money, Power & Ambition', 'RULE', '{"tagsAny":["wealth","power","ambition"]}'::jsonb, 'POPULARITY', 20, 4, true, 48, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'premium-premieres', 'Premium Premieres', 'RULE', '{"accessAny":["PAY_PER_VIEW","RENTAL","PURCHASE"],"anyOf":[{"premiere":true},{"publishedWithinDays":90}]}'::jsonb, 'PUBLISHED_DESC', 20, 4, true, 49, '{}', '{}', CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'limited-time', 'Limited-Time Releases', 'RULE', '{"expiringWithinDays":30}'::jsonb, 'EXPIRING_SOON', 20, 2, true, 50, '{}', '{}', CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- ─── Map legacy free-text columns onto the join tables ─────────────────────
-- catalogue_titles.genres: case-insensitive match on a top-level genre name or
-- slug (also after slugifying, so "Faith & Spirituality" / "science fiction"
-- match). Unknown names stay only in the legacy column.
INSERT INTO "title_genres" ("title_id", "genre_id", "position")
SELECT m.title_id, m.genre_id, (row_number() OVER (PARTITION BY m.title_id ORDER BY m.ord) - 1)::int
FROM (
  SELECT DISTINCT ON (t."id", g."id") t."id" AS title_id, g."id" AS genre_id, u.ord
  FROM "catalogue_titles" t
  CROSS JOIN LATERAL unnest(t."genres") WITH ORDINALITY AS u(name, ord)
  JOIN "genres" g ON g."parent_id" IS NULL AND (
       lower(g."name") = lower(btrim(u.name))
    OR g."slug" = lower(btrim(u.name))
    OR g."slug" = btrim(regexp_replace(replace(lower(u.name), '&', ''), '[^a-z0-9]+', '-', 'g'), '-')
  )
  ORDER BY t."id", g."id", u.ord
) m
ON CONFLICT DO NOTHING;

-- catalogue_titles.categories: slugs that exist as collections.
INSERT INTO "title_collections" ("title_id", "collection_id", "position")
SELECT DISTINCT t."id", c."id", 0
FROM "catalogue_titles" t
CROSS JOIN LATERAL unnest(t."categories") AS u(slug)
JOIN "collections" c ON c."slug" = lower(btrim(u.slug))
ON CONFLICT DO NOTHING;
