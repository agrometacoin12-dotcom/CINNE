'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BrowseResponse, TitleSummary } from '@cinnetemple/shared';
import { MobileShell } from '@/components/app/MobileShell';
import { api, ApiError } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

const CATEGORIES = ['All Movies', 'Comedy', 'Animation', 'Documentary'];

/** Home — desktop-first, indigo + glass language from the Figma. Big featured
 *  hero, category pills, Continue Watching, Popular, and catalogue rows. */
export default function HomePage() {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('All Movies');

  useEffect(() => {
    api.browse().then(setData).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load catalogue'));
  }, []);

  const rows = data?.rows ?? [];

  return (
    <MobileShell>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!data && !error && (
        <>
          <div className="h-[300px] animate-pulse rounded-2xl bg-white/[0.05] md:h-[440px]" />
          {[0, 1].map((i) => (
            <div key={i} className="mt-8 space-y-3">
              <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
              <div className="flex gap-4">{Array.from({ length: 8 }).map((_, j) => <div key={j} className="aspect-[2/3] w-[150px] flex-shrink-0 animate-pulse rounded-xl bg-white/[0.05]" />)}</div>
            </div>
          ))}
        </>
      )}

      {data?.hero && <Hero hero={data.hero} />}

      {/* Category pills */}
      <div className="mt-6 flex flex-wrap gap-2.5">
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`h-9 rounded-[10px] px-4 text-[13px] transition ${category === c ? 'font-semibold text-white lg-nav-active' : 'font-normal text-white/50 lg-glass'}`}>{c}</button>
        ))}
      </div>

      {/* Every catalogue row by its real title — "New Listings" is first, so
          newly published admin uploads appear here for users to watch. */}
      {rows.map((row) => (
        <Row key={row.slug} title={row.title}>
          {row.items.map((item) => <PosterTile key={item.id} item={item} />)}
        </Row>
      ))}

      {data && rows.length === 0 && (
        <p className="mt-10 text-center text-sm text-white/50">No titles published yet. New uploads appear here once published.</p>
      )}
    </MobileShell>
  );
}

function Row({ title, seeAll, children }: { title: string; seeAll?: boolean; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="font-readex text-xl font-semibold text-white">{title}</h2>
        {seeAll && <span className="text-sm font-bold text-[#6c6ffc]">See all</span>}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none]">{children}</div>
    </section>
  );
}

function Hero({ hero }: { hero: NonNullable<BrowseResponse['hero']> }) {
  const [broken, setBroken] = useState(false);
  const meta = [String(hero.year), hero.genres.slice(0, 2).join(', '), hero.runtimeMinutes ? `${Math.floor(hero.runtimeMinutes / 60)}h ${hero.runtimeMinutes % 60}m` : null, hero.maturityRating].filter(Boolean).join('  •  ');
  return (
    <section className="relative h-[320px] w-full overflow-hidden rounded-2xl bg-[#09090b] md:h-[440px]">
      {!broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/art/hero/${hero.id}.jpg`} alt={hero.title} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: gradientCss(hero.id) }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.5) 55%, rgba(9,9,11,0) 100%)' }} />
      <div className="relative flex h-full max-w-xl flex-col justify-end p-6 sm:p-12">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#8082ff]">Featured</span>
        <h1 className="mt-2 font-readex text-4xl font-bold leading-tight text-white drop-shadow-lg sm:text-6xl">{hero.title}</h1>
        <p className="mt-3 text-sm text-white/70">{meta}{hero.rating > 0 && <> • <span className="text-[#fbbf24]">★</span> {hero.rating.toFixed(1)}</>}</p>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/80 line-clamp-2 sm:line-clamp-3">{hero.overview}</p>
        <div className="mt-6 flex items-center gap-3">
          <Link href={`/title?id=${hero.id}`} className="lg-glass-indigo flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-semibold text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg>Play now
          </Link>
          <Link href={`/title?id=${hero.id}`} className="lg-glass flex h-11 items-center gap-2 rounded-xl px-6 text-sm font-semibold text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>More info
          </Link>
        </div>
      </div>
    </section>
  );
}

function PosterTile({ item }: { item: TitleSummary }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link href={`/title?id=${item.id}`} className="group w-[140px] flex-shrink-0 sm:w-[160px]">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 transition group-hover:border-[#6366f1]/60 group-hover:ring-2 group-hover:ring-[#6366f1]/40">
        {!broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.posterUrl ?? `/art/posters/${item.id}.jpg`} alt={item.title} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-2 text-center text-xs font-semibold text-white" style={{ background: gradientCss(item.id) }}>{item.title}</div>
        )}
      </div>
      <p className="mt-2 truncate text-[13px] text-white/85">{item.title}</p>
    </Link>
  );
}

function ContinueCard({ item, pct }: { item: TitleSummary; pct: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link href={`/title?id=${item.id}`} className="group w-[260px] flex-shrink-0 sm:w-[300px]">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl">
        {!broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.posterUrl ?? `/art/posters/${item.id}.jpg`} alt="" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: gradientCss(item.id) }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.05) 40%, rgba(9,9,11,0.85) 100%)' }} />
        <span className="lg-glass absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white opacity-0 transition group-hover:opacity-100">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg>
        </span>
        <div className="absolute inset-x-3 bottom-3 h-[5px] overflow-hidden rounded-full bg-[#090b12]">
          <div className="h-full rounded-full bg-[#6c6ffc]" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
      <p className="mt-2 truncate text-[14px] text-white">{item.title}</p>
      <p className="text-[12px] text-white/55">{Math.round((1 - pct) * 120)}m left</p>
    </Link>
  );
}
