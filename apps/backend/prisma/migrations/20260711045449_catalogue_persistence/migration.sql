-- CreateEnum
CREATE TYPE "TitleType" AS ENUM ('MOVIE', 'SERIES');

-- CreateEnum
CREATE TYPE "TitleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "catalogue_titles" (
    "id" UUID NOT NULL,
    "type" "TitleType" NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT,
    "overview" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "genres" TEXT[],
    "runtime_minutes" INTEGER,
    "seasons" INTEGER,
    "maturity_rating" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "poster_key" TEXT,
    "hero_key" TEXT,
    "cast_members" TEXT[],
    "director" TEXT,
    "categories" TEXT[],
    "popularity" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" "TitleStatus" NOT NULL DEFAULT 'DRAFT',
    "price_minor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "video_key" TEXT,
    "duration_seconds" INTEGER,
    "is_premiere" BOOLEAN NOT NULL DEFAULT false,
    "premiere_start_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalogue_titles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playback_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title_id" UUID NOT NULL,
    "position_seconds" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playback_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "catalogue_titles_status_idx" ON "catalogue_titles"("status");

-- CreateIndex
CREATE INDEX "catalogue_titles_featured_idx" ON "catalogue_titles"("featured");

-- CreateIndex
CREATE INDEX "catalogue_titles_popularity_idx" ON "catalogue_titles"("popularity");

-- CreateIndex
CREATE INDEX "catalogue_titles_is_premiere_status_idx" ON "catalogue_titles"("is_premiere", "status");

-- CreateIndex
CREATE INDEX "playback_progress_user_id_idx" ON "playback_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "playback_progress_user_id_title_id_key" ON "playback_progress"("user_id", "title_id");

-- AddForeignKey
ALTER TABLE "playback_progress" ADD CONSTRAINT "playback_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
