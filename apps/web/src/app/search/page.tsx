'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { TitleSummary } from '@cinnetemple/shared';
import { MobileShell } from '@/components/app/MobileShell';
import { api } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

const RECENT = ['Spiderman', 'Parasite', 'Sci-Fi movies', 'Wes Anderson'];
const GENRES = ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Anime', 'Documentary', 'Thriller'];

/* eslint-disable @next/next/no-img-element */
/**
 * Search — exact Figma web frame 42:14209 (and iPhone 42:13705 on mobile):
 * glass search bar (1099×56, rounded 14), "Recent searches" glass chips
 * (h-34, rounded 17), "Trending Now" grid of 196×262 posters with an indigo
 * "See all", and "Browse by genre" chips (h-36, rounded 18, indigo 0.12).
 */
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TitleSummary[]>([]);
  const [trending, setTrending] = useState<TitleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    api
      .browse()
      .then((b) => {
        const seen = new Set<string>();
        const all: TitleSummary[] = [];
        b.rows.forEach((r) =>
          r.items.forEach((t) => {
            if (!seen.has(t.id)) {
              seen.add(t.id);
              all.push(t);
            }
          }),
        );
        setTrending(all.slice(0, 10));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api
        .searchCatalogue(q)
        .then((r) => {
          setResults(r.results);
          setSearched(true);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const grid = query.trim() ? results : trending;

  return (
    <MobileShell>
      {/* Search bar — 42:14317 */}
      <div
        className="lg-glass mt-2 flex h-14 items-center gap-3 rounded-[14px] px-4 text-white/60"
        style={{ background: 'rgba(214,214,214,0.1)' }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3-3" />
        </svg>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for movies, shows...."
          className="flex-1 bg-transparent text-[13.6px] text-white placeholder:text-white/60 outline-none"
        />
      </div>

      {/* Recent searches — 42:14323 */}
      {!query.trim() && (
        <section className="mt-7">
          <h2 className="font-readex text-base font-medium text-white/90">Recent searches</h2>
          <div className="mt-3 flex flex-wrap gap-4">
            {RECENT.map((r) => (
              <button
                key={r}
                onClick={() => setQuery(r)}
                className="lg-glass grid h-[34px] place-items-center rounded-[17px] px-6 text-[12.5px] text-white/75"
                style={{ background: 'rgba(214,214,214,0.06)' }}
              >
                {r}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Trending Now / results — 42:14333 */}
      <section className="mt-9">
        <div className="flex items-end justify-between">
          <h2 className="font-readex text-xl font-medium text-white">
            {query.trim() ? (loading ? 'Searching…' : 'Results') : 'Trending Now'}
          </h2>
          {!query.trim() && (
            <Link href="/categories" className="text-sm font-semibold text-[#6c6ffc]">
              See all
            </Link>
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-[30px] gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {grid.map((item) => (
            <SearchPoster key={item.id} item={item} />
          ))}
        </div>
        {searched && !loading && results.length === 0 && (
          <p className="mt-6 text-sm text-white/50">No titles found for “{query.trim()}”.</p>
        )}
      </section>

      {/* Browse by genre — 42:14345 */}
      {!query.trim() && (
        <section className="mt-12 pb-4">
          <h2 className="font-readex text-base font-medium text-white/90">Browse by genre</h2>
          <div className="mt-3 flex flex-wrap gap-4">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setQuery(g)}
                className="lg-glass grid h-9 place-items-center rounded-[18px] px-6 text-[13px] text-white/85"
                style={{ background: 'rgba(99,102,241,0.12)' }}
              >
                {g}
              </button>
            ))}
          </div>
        </section>
      )}
    </MobileShell>
  );
}

/** Poster 196×262, rounded 14 (42:14335). */
function SearchPoster({ item }: { item: TitleSummary }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link
      href={`/title?id=${item.id}`}
      className="block aspect-[196/262] w-full overflow-hidden rounded-[14px]"
    >
      {!broken ? (
        <img
          src={item.posterUrl ?? `/art/posters/${item.id}.jpg`}
          alt={item.title}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover transition duration-300 hover:scale-105"
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center p-2 text-center text-xs font-semibold text-white"
          style={{ background: gradientCss(item.id) }}
        >
          {item.title}
        </div>
      )}
    </Link>
  );
}
