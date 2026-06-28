'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { WatchlistItem } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { Button } from '@/components/ui/Button';
import { PosterCard } from '@/components/catalogue/PosterCard';
import { RequireAuth } from '@/components/RequireAuth';
import { api } from '@/lib/api';

function WatchlistInner() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.watchlist());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (titleId: string) => {
    await api.removeFromWatchlist(titleId).catch(() => undefined);
    setItems((prev) => prev.filter((i) => i.titleId !== titleId));
  };

  return (
    <>
      <GlassNav />
      <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold">My list</h1>

        {loading && <p className="text-sm text-[var(--text-secondary)]">Loading…</p>}

        {!loading && items.length === 0 && (
          <div className="glass rounded-glass p-8 text-center">
            <p className="text-[var(--text-secondary)]">Your list is empty.</p>
            <Link href="/browse" className="mt-4 inline-block">
              <Button variant="primary">Browse the catalogue</Button>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {items.map(
            (item) =>
              item.title && (
                <div key={item.titleId} className="space-y-2">
                  <PosterCard item={item.title} />
                  <button
                    onClick={() => remove(item.titleId)}
                    className="w-full text-xs text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
                  >
                    Remove
                  </button>
                </div>
              ),
          )}
        </div>
      </main>
    </>
  );
}

export default function WatchlistPage() {
  return (
    <RequireAuth>
      <WatchlistInner />
    </RequireAuth>
  );
}
