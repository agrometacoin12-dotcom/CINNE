'use client';

import { useEffect, useState } from 'react';
import type { TitleSummary } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { TextField } from '@/components/ui/TextField';
import { PosterCard } from '@/components/catalogue/PosterCard';
import { api } from '@/lib/api';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TitleSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Debounced search as the user types.
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
    <>
      <GlassNav />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6">
        <h1 className="mb-5 text-2xl font-bold">Search</h1>
        <TextField
          label="Find a title"
          placeholder="Search movies and series…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="mt-8">
          {loading && <p className="text-sm text-[var(--text-secondary)]">Searching…</p>}
          {!loading && searched && results.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">No results for “{query}”.</p>
          )}
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
            {results.map((item) => (
              <PosterCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
