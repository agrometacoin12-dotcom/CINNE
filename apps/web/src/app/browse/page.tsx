'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BrowseResponse, TitleSummary } from '@cinnetemple/shared';
import { MobileShell } from '@/components/app/MobileShell';
import { api, ApiError } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

/** GET /v1/playback/continue row (mirrors the backend contract). */
interface ContinueItem {
  titleId: string;
  title: string;
  posterUrl: string | null;
  heroUrl: string | null;
  positionSeconds: number;
  durationSeconds: number;
  progress: number;
}

/* eslint-disable @next/next/no-img-element */
/**
 * Home — exact Figma frame 42:12534: featured hero (1064×355, rounded 16,
 * bg #000209, right-side art behind a leftward scrim), carousel dots,
 * "Continue Watching" cards (254px, landscape, indigo progress bar, "Xh Ym
 * left"), and "Trending Now" tiles (101×143, rounded 12, white/35 border,
 * gradient rating pill). Rows come from the live catalogue.
 */
export default function HomePage() {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continueItems, setContinueItems] = useState<ContinueItem[]>([]);

  useEffect(() => {
    api
      .browse()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load catalogue'));
    // Real "Continue Watching" — only shown to signed-in viewers with progress.
    api
      .playbackContinue()
      .then((list) => setContinueItems(list as ContinueItem[]))
      .catch(() => undefined);
  }, []);

  const rows = data?.rows ?? [];

  return (
    <MobileShell>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!data && !error && (
        <>
          <div className="h-[355px] animate-pulse rounded-2xl bg-white/[0.05]" />
          {[0, 1].map((i) => (
            <div key={i} className="mt-8 space-y-3">
              <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
              <div className="flex gap-4">
                {Array.from({ length: 8 }).map((_, j) => (
                  <div
                    key={j}
                    className="aspect-[2/3] w-[102px] flex-shrink-0 animate-pulse rounded-xl bg-white/[0.05]"
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {data?.hero && <Hero hero={data.hero} />}

      {/* Continue Watching — real, from GET /v1/playback/continue. Rendered only
          when the viewer actually has titles in progress. */}
      {continueItems.length > 0 && (
        <Row title="Continue Watching" slug="continue" seeAllHref={null}>
          {continueItems.map((item) => (
            <ContinueCard key={item.titleId} item={item} />
          ))}
        </Row>
      )}

      {/* Catalogue rows — Trending tiles (Figma 42:12535). */}
      {rows.map((row) => (
        <Row key={row.slug} title={row.title} slug={row.slug}>
          {row.items.map((item) => (
            <TrendTile key={item.id} item={item} />
          ))}
        </Row>
      ))}

      {data && rows.length === 0 && (
        <p className="mt-10 text-center text-sm text-white/50">
          No titles published yet. New uploads appear here once published.
        </p>
      )}
    </MobileShell>
  );
}

function Row({
  title,
  slug,
  seeAllHref = '/categories',
  children,
}: {
  title: string;
  slug: string;
  seeAllHref?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section id={slug} className="mt-10">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="font-readex text-xl font-medium text-white">{title}</h2>
        {seeAllHref && (
          <Link href={seeAllHref} className="text-lg font-bold text-[#6c6ffc]">
            See all
          </Link>
        )}
      </div>
      <div className="flex gap-[14px] overflow-x-auto pb-2 [scrollbar-width:none]">{children}</div>
    </section>
  );
}

/** Featured hero — 42:12688: 355px, bg #000209, art right, scrim to the left. */
function Hero({ hero }: { hero: NonNullable<BrowseResponse['hero']> }) {
  const [broken, setBroken] = useState(false);
  const runtime = hero.runtimeMinutes
    ? `${Math.floor(hero.runtimeMinutes / 60)}h ${hero.runtimeMinutes % 60}m`
    : null;
  const meta = [String(hero.year), hero.genres[0], runtime, hero.maturityRating].filter(
    Boolean,
  ) as string[];
  return (
    <>
      <section className="relative h-[355px] w-full overflow-hidden rounded-2xl bg-[#000209]">
        {!broken ? (
          <img
            src={hero.heroUrl ?? `/art/hero/${hero.id}.jpg`}
            alt={hero.title}
            onError={() => setBroken(true)}
            className="absolute inset-y-0 left-[24%] h-full w-[76%] object-cover"
          />
        ) : (
          <div className="absolute inset-0" style={{ background: gradientCss(hero.id) }} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, #09090b 23.99%, rgba(9,9,11,0.95) 38.9%, rgba(9,9,11,0.75) 54.93%, rgba(9,9,11,0) 100%)',
          }}
        />
        <div className="relative flex h-full w-[315px] max-w-full flex-col justify-center pl-6 sm:pl-10">
          <span className="text-base font-medium text-[#6366f1]">FEATURED</span>
          <h1 className="mt-1 font-readex text-[40px] font-bold leading-tight text-white">
            {hero.title}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-medium text-white/60">
            {meta.map((m, i) => (
              <span key={m} className="flex items-center gap-1.5">
                {i > 0 && <span className="inline-block h-1 w-1 rounded-full bg-white/60" />}
                {m}
              </span>
            ))}
            {hero.rating > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1 w-1 rounded-full bg-white/60" />
                <svg width="15" height="15" viewBox="0 0 24 24" fill="#fbbf24">
                  <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8Z" />
                </svg>
                {hero.rating.toFixed(1)}
              </span>
            )}
          </p>
          <p className="mt-3 text-sm font-medium leading-normal text-white/80 line-clamp-3">
            {hero.overview}
          </p>
          <div className="mt-10 flex items-center gap-[17px]">
            <Link
              href={`/title?id=${hero.id}`}
              className="flex h-[46px] items-center gap-3 rounded-[12px] px-5 text-[15px] font-semibold text-white"
              style={{ background: 'rgba(99,102,241,0.2)' }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m10 8.5 5 3.5-5 3.5v-7Z" />
              </svg>
              Play now
            </Link>
            <Link
              href={`/title?id=${hero.id}`}
              className="flex h-[46px] items-center gap-3 rounded-[12px] border border-white px-5 text-[15px] font-semibold text-white"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              More info
            </Link>
          </div>
        </div>
      </section>
      {/* Carousel dots — 42:12729 */}
      <div className="mt-6 flex items-center justify-center gap-2">
        <span className="h-4 w-4 rounded-full bg-[#6c6ffc]" />
        <span className="h-2.5 w-6 rounded-full bg-white/20" />
        <span className="h-2.5 w-6 rounded-full bg-white/20" />
      </div>
    </>
  );
}

/** Continue Watching card — 42:12634: 254px, landscape, real resume progress. */
function ContinueCard({ item }: { item: ContinueItem }) {
  const [broken, setBroken] = useState(false);
  const pct = Math.max(0, Math.min(1, item.progress || 0));
  const art = item.heroUrl ?? item.posterUrl ?? `/art/hero/${item.titleId}.jpg`;
  return (
    <Link href={`/watch?id=${item.titleId}`} className="group w-[254px] flex-shrink-0">
      <div className="relative h-[141px] w-full overflow-hidden rounded-[14px]">
        {!broken ? (
          <img
            src={art}
            alt=""
            onError={() => setBroken(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0" style={{ background: gradientCss(item.titleId) }} />
        )}
        {/* top + bottom scrims */}
        <div
          className="absolute inset-x-0 top-0 h-[71px]"
          style={{
            background: 'linear-gradient(0deg, rgba(9,9,11,0.1) 10%, rgba(9,9,11,0.8) 74%)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[57px]"
          style={{
            background: 'linear-gradient(180deg, rgba(9,9,11,0.1) 10%, rgba(9,9,11,0.8) 74%)',
          }}
        />
        {/* bookmark */}
        <svg
          className="absolute left-4 top-4"
          width="11"
          height="14"
          viewBox="0 0 11 14"
          fill="none"
          stroke="#fff"
          strokeWidth="1.3"
        >
          <path d="M1 1h9v12L5.5 9.8 1 13V1Z" />
        </svg>
        {/* progress */}
        <div className="absolute bottom-[7px] left-4 h-1.5 w-[221px] max-w-[calc(100%-32px)] overflow-hidden rounded-[2px] bg-[#090b12]">
          <div className="h-full rounded-[2px] bg-[#6c6ffc]" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
      <p className="mt-2.5 truncate font-readex text-lg text-white">{item.title}</p>
      {item.durationSeconds > 0 && item.positionSeconds < item.durationSeconds && (
        <p className="mt-1 text-sm text-[#eeeeee]/85">{formatLeft(item)}</p>
      )}
    </Link>
  );
}

/** Real time-remaining from saved progress (no fabricated numbers). */
function formatLeft(item: ContinueItem): string {
  const leftSec = Math.max(0, item.durationSeconds - item.positionSeconds);
  const h = Math.floor(leftSec / 3600);
  const m = Math.floor((leftSec % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m left` : `${m}m left`;
}

/** Trending tile — 42:12537: 101×143, rounded 12, white/35 border, rating pill. */
function TrendTile({ item }: { item: TitleSummary }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link href={`/title?id=${item.id}`} className="relative w-[102px] flex-shrink-0">
      <div className="relative h-[143px] w-full overflow-hidden rounded-[12px] border border-white/35 transition group-hover:border-[#6366f1]/60">
        {!broken ? (
          <img
            src={item.posterUrl ?? `/art/posters/${item.id}.jpg`}
            alt={item.title}
            onError={() => setBroken(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 grid place-items-center p-1 text-center text-[10px] font-semibold text-white"
            style={{ background: gradientCss(item.id) }}
          >
            {item.title}
          </div>
        )}
      </div>
      {item.rating > 0 && (
        <span
          className="absolute -right-1 top-[5px] flex items-center gap-0.5 rounded-full px-1 py-0.5 text-sm font-medium text-white"
          style={{
            backgroundImage: 'linear-gradient(99deg, rgba(108,111,252,0) 8.77%, #6c6ffc 70.69%)',
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.6"
            strokeLinejoin="round"
          >
            <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8Z" />
          </svg>
          {item.rating.toFixed(1)}
        </span>
      )}
    </Link>
  );
}
