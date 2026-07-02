'use client';

import { useEffect, useState } from 'react';
import type { TitleSummary } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { PosterCard } from '@/components/catalogue/PosterCard';
import { api } from '@/lib/api';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TitleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.searchCatalogue(q);
        setResults(res.results);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <AppShell>
      <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-8 sm:px-12">
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-white">Search</h1>

        <div className="relative max-w-2xl">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40"
            width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies and series…"
            className="w-full rounded-full border border-white/10 bg-white/[0.06] py-3.5 pl-12 pr-4 text-white placeholder:text-white/40 outline-none transition focus:border-white/30 focus:bg-white/[0.09]"
          />
        </div>

        <div className="mt-10">
          {loading && <p className="text-sm text-white/60">Searching…</p>}
          {!loading && searched && results.length === 0 && (
            <p className="text-sm text-white/60">No results for “{query}”.</p>
          )}
          {!searched && !loading && (
            <p className="text-sm text-white/50">Find something to watch — start typing above.</p>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
            {results.map((item) => (
              <PosterCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
