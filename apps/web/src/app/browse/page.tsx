'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BrowseResponse, BrowseRow, TitleSummary } from '@cinnetemple/shared';
import { MobileShell } from '@/components/app/MobileShell';
import { api, ApiError } from '@/lib/api';
import { artPoster, gradientCss } from '@/lib/poster';

const CATEGORIES = ['All Movies', 'Comedy', 'Animation', 'Documentary'];

/** Home — exact Figma (node 42:13488): featured hero, Continue Watching with
 *  indigo progress, glass category pills, and a Popular poster row. */
export default function HomePage() {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('All Movies');

  useEffect(() => {
    api.browse().then(setData).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load catalogue'));
  }, []);

  const rows = data?.rows ?? [];
  const continueRow = rows[0];
  const popularRow = rows[1] ?? rows[0];
  const otherRows = rows.slice(2);

  return (
    <MobileShell>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {data?.hero && <HeroCard hero={data.hero} />}

      {continueRow && continueRow.items.length > 0 && (
        <section className="mt-7">
          <SectionHeader title="Continue Watching" seeAll />
          <div className="-mx-5 mt-3 flex gap-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {continueRow.items.map((item, i) => (
              <ContinueCard key={item.id} item={item} pct={[0.4, 0.26, 0.6, 0.15][i % 4]} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-7">
        <h2 className="text-[15px] font-semibold text-white">Categories</h2>
        <div className="-mx-5 mt-3 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`h-8 whitespace-nowrap rounded-[9.5px] px-3.5 text-[11px] transition ${category === c ? 'font-semibold text-white lg-nav-active' : 'font-normal text-[#1d1f26]/40'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {popularRow && <PosterRow title="Popular" items={popularRow.items} />}
      {otherRows.map((row) => (
        <PosterRow key={row.slug} title={row.title} items={row.items} />
      ))}
    </MobileShell>
  );
}

function SectionHeader({ title, seeAll }: { title: string; seeAll?: boolean }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="font-readex text-[16px] font-medium text-white">{title}</h2>
      {seeAll && <span className="text-[14px] font-bold text-[#6c6ffc]">See all</span>}
    </div>
  );
}

function HeroCard({ hero }: { hero: BrowseResponse['hero'] }) {
  const [broken, setBroken] = useState(false);
  if (!hero) return null;
  const meta = [String(hero.year), hero.genres[0], hero.runtimeMinutes ? `${Math.floor(hero.runtimeMinutes / 60)}h ${hero.runtimeMinutes % 60}m` : null, hero.maturityRating].filter(Boolean);
  return (
    <Link href={`/title?id=${hero.id}`} className="relative block h-[172px] w-full overflow-hidden rounded-[17px] bg-[#09090b]">
      {!broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/art/hero/${hero.id}.jpg`} alt={hero.title} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: gradientCss(hero.id) }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.1) 10%, rgba(9,9,11,0.8) 74%)' }} />
      <div className="absolute inset-x-3 bottom-3">
        <h2 className="font-readex text-[16px] font-bold text-white">{hero.title}</h2>
        <div className="mt-1 flex items-center gap-1.5 text-[9px] text-white/60">
          {meta.map((m, i) => (
            <span key={i} className="flex items-center gap-1.5">{i > 0 && <span className="h-[2px] w-[2px] rounded-full bg-white/40" />}{m}</span>
          ))}
          {hero.rating > 0 && <span className="flex items-center gap-0.5"><span className="text-[#fbbf24]">★</span>{hero.rating.toFixed(1)}</span>}
        </div>
        <p className="mt-1 line-clamp-2 text-[9px] text-white/80">{hero.overview}</p>
        <div className="mt-2 flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-[5px] px-2 py-1 text-[8px] font-semibold text-white" style={{ background: 'rgba(99,102,241,0.2)' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg>Play now
          </span>
          <span className="flex items-center gap-1 rounded-[5px] border border-white px-2 py-1 text-[8px] font-semibold text-white">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>More info
          </span>
        </div>
      </div>
    </Link>
  );
}

function ContinueCard({ item, pct }: { item: TitleSummary; pct: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link href={`/title?id=${item.id}`} className="w-[204px] flex-shrink-0">
      <div className="relative h-[114px] overflow-hidden rounded-[11px]">
        {!broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.posterUrl ?? `/art/posters/${item.id}.jpg`} alt="" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: gradientCss(item.id) }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.1) 10%, rgba(9,9,11,0.8) 74%)' }} />
        <svg className="absolute left-3 top-3 text-white" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg>
        <div className="absolute inset-x-3 bottom-2.5 h-[5px] overflow-hidden rounded-full bg-[#090b12]">
          <div className="h-full rounded-full bg-[#6c6ffc]" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
      <p className="mt-2 truncate text-[14px] text-white">{item.title}</p>
      <p className="text-[11px] text-[#eeeeee]/80">2h left</p>
    </Link>
  );
}

function PosterRow({ title, items }: { title: string; items: TitleSummary[] }) {
  return (
    <section className="mt-7">
      <h2 className="font-readex text-[15px] font-semibold text-white">{title}</h2>
      <div className="-mx-5 mt-3 flex gap-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {items.map((item) => (
          <PosterTile key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function PosterTile({ item }: { item: TitleSummary }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link href={`/title?id=${item.id}`} className="w-[147px] flex-shrink-0">
      <div className="relative h-[208px] w-[147px] overflow-hidden rounded-[12px] border border-white/35">
        {!broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.posterUrl ?? `/art/posters/${item.id}.jpg`} alt={item.title} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-2 text-center text-xs font-semibold text-white" style={{ background: gradientCss(item.id) }}>{item.title}</div>
        )}
      </div>
    </Link>
  );
}
