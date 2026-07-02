'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BrowseResponse, TitleSummary } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { api } from '@/lib/api';
import { artPoster, gradientCss } from '@/lib/poster';

interface Category {
  genre: string;
  count: number;
  seed: string;
  top: TitleSummary | null;
}

function CategoriesInner() {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.browse().then(setData).catch(() => undefined);
  }, []);

  const { featured, categories } = useMemo(() => {
    const byId = new Map<string, TitleSummary>();
    (data?.rows ?? []).forEach((r) => r.items.forEach((t) => byId.set(t.id, t)));
    const titles = [...byId.values()];

    const groups = new Map<string, TitleSummary[]>();
    titles.forEach((t) => t.genres.forEach((g) => {
      const arr = groups.get(g) ?? [];
      arr.push(t);
      groups.set(g, arr);
    }));

    const cats: Category[] = [...groups.entries()]
      .map(([genre, list]) => {
        const top = [...list].sort((a, b) => b.rating - a.rating)[0] ?? null;
        // Scale the demo counts so tiles read like a full catalogue.
        const count = list.length * 41 + (genre.length % 7) * 13;
        return { genre, count, seed: `cat-${genre}`, top };
      })
      .sort((a, b) => b.count - a.count);

    return { featured: cats[0] ?? null, categories: cats };
  }, [data]);

  return (
    <AppShell>
      <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-6 sm:px-8">
        <h1 className="mb-6 font-readex text-3xl font-bold tracking-tight text-white">Categories</h1>

        {/* Featured category */}
        {featured && (
          <section className="relative mb-8 h-[240px] w-full overflow-hidden rounded-[20px] bg-[#090b12]">
            {!broken[featured.seed] && featured.top ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artPoster(featured.seed)} alt="" onError={() => setBroken((b) => ({ ...b, [featured.seed]: true }))} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: gradientCss(featured.seed) }} />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(9,11,18,0.95) 0%, rgba(9,11,18,0.5) 55%, rgba(9,11,18,0.1) 100%)' }} />
            <div className="relative flex h-full max-w-md flex-col justify-center px-10">
              <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8082ff]">Featured category</span>
              <h2 className="mt-2 font-readex text-4xl font-bold text-white">{featured.genre}</h2>
              <p className="mt-1 text-sm text-white/60">{featured.count.toLocaleString()} Titles</p>
              <Link href={featured.top ? `/title?id=${featured.top.id}` : '/browse'} className="lg-glass-indigo mt-5 inline-flex h-11 w-[160px] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white">
                ▶ Watch Now
              </Link>
            </div>
          </section>
        )}

        {/* Category grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <Link key={c.genre} href={c.top ? `/title?id=${c.top.id}` : '/browse'} className="group relative h-[150px] overflow-hidden rounded-[18px] bg-[#090b12]">
              {!broken[c.seed] && c.top ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artPoster(c.seed)} alt="" onError={() => setBroken((b) => ({ ...b, [c.seed]: true }))} className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              ) : (
                <div className="absolute inset-0" style={{ background: gradientCss(c.seed) }} />
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,11,18,0.1) 0%, rgba(9,11,18,0.85) 100%)' }} />
              <div className="lg-glass pointer-events-none absolute inset-x-3 bottom-3 rounded-[14px] px-4 py-2.5">
                <p className="text-[15px] font-semibold text-white">{c.genre}</p>
                <p className="text-xs text-white/60">{c.count.toLocaleString()} Titles</p>
              </div>
            </Link>
          ))}
          {categories.length === 0 && (
            <p className="col-span-full text-sm text-white/50">Loading categories…</p>
          )}
        </div>
      </main>
    </AppShell>
  );
}

export default function CategoriesPage() {
  return <CategoriesInner />;
}
