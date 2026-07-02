'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { TitleSummary } from '@cinnetemple/shared';
import { MobileShell } from '@/components/app/MobileShell';
import { api } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

const RECENT = ['Spiderman', 'Parasite', 'Sci-Fi movies'];

/** Search — exact Figma (node 42:13705): glass search field, Recent glass chips,
 *  and a Trending Now 2-column poster grid. */
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TitleSummary[]>([]);
  const [trending, setTrending] = useState<TitleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    api.browse().then((b) => setTrending(b.rows.flatMap((r) => r.items).slice(0, 8))).catch(() => undefined);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearched(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      api.searchCatalogue(q).then((r) => { setResults(r.results); setSearched(true); }).catch(() => undefined).finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const grid = query.trim() ? results : trending;

  return (
    <MobileShell showTopBar={false}>
      <div className="lg-glass flex h-11 items-center gap-2 rounded-[11.5px] px-4 text-white/60">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for movies, shows...."
          className="flex-1 bg-transparent text-[13px] text-white placeholder:text-white/60 outline-none"
        />
      </div>

      {!query.trim() && (
        <section className="mt-6">
          <h2 className="font-readex text-[15px] font-semibold text-white">Recent</h2>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {RECENT.map((r) => (
              <button key={r} onClick={() => setQuery(r)} className="lg-glass rounded-full px-4 py-2 text-[12px] text-white/85">{r}</button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-readex text-[15px] font-semibold text-white">{query.trim() ? 'Results' : 'Trending Now'}</h2>
        {loading && <p className="mt-3 text-sm text-white/60">Searching…</p>}
        {searched && results.length === 0 && !loading && (
          <div className="mt-10 flex flex-col items-center text-center">
            <div className="text-4xl">🔍</div>
            <p className="mt-3 text-sm text-white/70">No results for “{query}”.</p>
            <p className="text-xs text-white/45">Try a different title or genre.</p>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {grid.map((item) => (
            <TrendingTile key={item.id} item={item} />
          ))}
        </div>
      </section>
    </MobileShell>
  );
}

function TrendingTile({ item }: { item: TitleSummary }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link href={`/title?id=${item.id}`} className="block">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[12px] border border-white/35">
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
