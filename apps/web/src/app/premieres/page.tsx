'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Title } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { api, formatPrice } from '@/lib/api';

export default function PremieresPage() {
  const [items, setItems] = useState<Title[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .premieres()
      .then(setItems)
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  return (
    <>
      <GlassNav />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
        <h1 className="mb-1 text-3xl font-extrabold">Premieres</h1>
        <p className="mb-6 text-sm text-[var(--text-secondary)]">
          Live, ticketed showings with real-time chat. Pay once, watch live.
        </p>
        <div className="grid gap-3">
          {items.map((p) => (
            <GlassPanel key={p.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-lg font-semibold">{p.title}</span>
                  {p.premiereLive ? (
                    <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-300">● LIVE</span>
                  ) : (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">Upcoming</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {p.premiereStartAt ? new Date(p.premiereStartAt).toLocaleString() : 'Showtime TBA'} · {formatPrice(p.priceMinor, p.currency)}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/premiere?id=${p.id}`}><Button variant={p.premiereLive ? 'primary' : 'glass'}>{p.premiereLive ? 'Join live' : 'View'}</Button></Link>
                <Link href={`/title?id=${p.id}`}><Button variant="ghost">Details</Button></Link>
              </div>
            </GlassPanel>
          ))}
          {loaded && items.length === 0 && (
            <p className="text-sm text-[var(--text-secondary)]">No premieres scheduled yet. Check back soon.</p>
          )}
        </div>
      </main>
    </>
  );
}
