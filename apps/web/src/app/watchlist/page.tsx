'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { WatchlistItem } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
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

  const visible = items.filter((i) => i.title);

  return (
    <AppShell>
      <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-8 sm:px-12">
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-white">My list</h1>

        {loading && <p className="text-sm text-white/60">Loading…</p>}

        {!loading && visible.length === 0 && (
          <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-16 text-center">
            <div className="text-4xl">🍿</div>
            <p className="mt-3 text-white/70">Your list is empty.</p>
            <Link href="/browse" className="mt-5">
              <Button variant="primary">Browse the catalogue</Button>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
          {visible.map(
            (item) =>
              item.title && (
                <div key={item.titleId} className="space-y-1.5">
                  <PosterCard item={item.title} />
                  <button
                    onClick={() => remove(item.titleId)}
                    className="w-full text-center text-xs text-white/50 transition-colors hover:text-white"
                  >
                    Remove
                  </button>
                </div>
              ),
          )}
        </div>
      </main>
    </AppShell>
  );
}

export default function WatchlistPage() {
  return (
    <RequireAuth>
      <WatchlistInner />
    </RequireAuth>
  );
}
