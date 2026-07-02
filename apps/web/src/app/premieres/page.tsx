'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Title } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/Button';
import { api, formatPrice } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

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
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-12">
        <h1 className="mb-1 text-3xl font-bold tracking-tight text-white">Premieres</h1>
        <p className="mb-8 text-sm text-white/60">
          Live, ticketed showings with real-time chat. Pay once, watch live.
        </p>

        <div className="grid gap-3">
          {items.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] p-4"
            >
              <div
                className="h-20 w-14 flex-shrink-0 rounded-md"
                style={{ background: gradientCss(p.id) }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-lg font-semibold text-white">{p.title}</span>
                  {p.premiereLive ? (
                    <span className="rounded-full bg-[#e50914] px-2 py-0.5 text-[11px] font-bold text-white">● LIVE</span>
                  ) : (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">Upcoming</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-white/55">
                  {p.premiereStartAt ? new Date(p.premiereStartAt).toLocaleString() : 'Showtime TBA'} · {formatPrice(p.priceMinor, p.currency)}
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/premiere?id=${p.id}`}>
                  <Button variant={p.premiereLive ? 'primary' : 'glass'}>{p.premiereLive ? 'Join live' : 'View'}</Button>
                </Link>
                <Link href={`/title?id=${p.id}`}><Button variant="ghost">Details</Button></Link>
              </div>
            </div>
          ))}
          {loaded && items.length === 0 && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] py-14 text-center">
              <div className="text-4xl">✨</div>
              <p className="mt-3 text-white/70">No premieres scheduled yet.</p>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
