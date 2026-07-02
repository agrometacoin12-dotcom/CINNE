'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { WatchlistItem } from '@cinnetemple/shared';
import { MobileShell } from '@/components/app/MobileShell';
import { Button } from '@/components/ui/Button';
import { MovieTile } from '@/components/catalogue/MovieTile';
import { RequireAuth } from '@/components/RequireAuth';
import { api } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

/* eslint-disable @next/next/no-img-element */
/**
 * My List — exact Figma "List" frame 42:13889: a large resume-watching panel
 * (1052×573, inline player chrome with centered play, progress bar and
 * timecodes) above "Continue watching" and list rows of Movie Tiles
 * (190×267, rounded 12, white/35 border).
 */
function WatchlistInner() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [broken, setBroken] = useState(false);

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
  const featured = visible[0]?.title ?? null;
  const rest = visible.slice(1);

  return (
    <MobileShell>
      {loading && <p className="pt-4 text-sm text-white/60">Loading…</p>}

      {!loading && visible.length === 0 && (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] py-16 text-center">
          <div className="text-4xl">🍿</div>
          <p className="mt-3 text-white/70">Your list is empty.</p>
          <Link href="/browse" className="mt-5">
            <Button variant="primary">Browse the catalogue</Button>
          </Link>
        </div>
      )}

      {/* Resume panel — 42:13898: inline player chrome */}
      {featured && (
        <Link
          href={`/title?id=${featured.id}`}
          className="group relative mt-2 block aspect-[1052/573] w-full overflow-hidden rounded-2xl bg-black"
        >
          {!broken ? (
            <img
              src={featured.posterUrl ?? `/art/posters/${featured.id}.jpg`}
              alt={featured.title}
              onError={() => setBroken(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0" style={{ background: gradientCss(featured.id) }} />
          )}
          <div className="absolute inset-0 bg-black/25" />
          {/* centered play */}
          <span className="lg-glass absolute left-1/2 top-1/2 grid h-[76px] w-[108px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[20px] text-white transition group-hover:scale-105">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff">
              <path d="M8 5v14l11-7L8 5Z" />
            </svg>
          </span>
          {/* bottom chrome: title, progress, timecodes */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-8 pb-6 pt-14">
            <p className="text-[16px] text-white">{featured.title}</p>
            <div className="mt-3 h-[3px] w-full rounded-full bg-white/25">
              <div className="relative h-full w-[37%] rounded-full bg-[#6c6ffc]">
                <span className="absolute -right-1.5 -top-[4.5px] h-3 w-3 rounded-full bg-white" />
              </div>
            </div>
            <div className="mt-2 flex justify-between text-[10.5px] font-light text-white/80">
              <span>0:52:03</span>
              <span>2:21:32</span>
            </div>
          </div>
        </Link>
      )}

      {/* Continue watching — 42:13925 */}
      {visible.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-readex text-xl font-medium text-white">Continue watching</h2>
          <div className="flex gap-[26px] overflow-x-auto pb-2 [scrollbar-width:none]">
            {visible.map(
              (item) =>
                item.title && <MovieTile key={item.titleId} item={item.title} w={190} h={267} />,
            )}
          </div>
        </section>
      )}

      {/* My List — 42:13934 */}
      {rest.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-readex text-xl font-medium text-white">My List</h2>
          <div className="flex flex-wrap gap-[26px]">
            {rest.map(
              (item) =>
                item.title && (
                  <div key={item.titleId} className="space-y-1.5">
                    <MovieTile item={item.title} w={190} h={267} />
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
        </section>
      )}
    </MobileShell>
  );
}

export default function WatchlistPage() {
  return (
    <RequireAuth>
      <WatchlistInner />
    </RequireAuth>
  );
}
