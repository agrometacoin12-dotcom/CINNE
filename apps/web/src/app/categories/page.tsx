'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BrowseResponse, TitleSummary } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { MovieTile } from '@/components/catalogue/MovieTile';
import { api } from '@/lib/api';
import { artPoster, gradientCss } from '@/lib/poster';

/* eslint-disable @next/next/no-img-element */
/**
 * Browse / Categories — exact Figma frame 42:12820: a strip of four category
 * cards (259×156, #060608, rounded 8, bold 22px name over a dimmed still),
 * then "Continue Watching" and genre rows of Movie Tiles (186×263, rounded 12,
 * white/35 border) each with an indigo "See all".
 */
function CategoriesInner() {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api
      .browse()
      .then(setData)
      .catch(() => undefined);
  }, []);

  const { categories, rows } = useMemo(() => {
    const byId = new Map<string, TitleSummary>();
    (data?.rows ?? []).forEach((r) => r.items.forEach((t) => byId.set(t.id, t)));
    const titles = [...byId.values()];

    const groups = new Map<string, TitleSummary[]>();
    titles.forEach((t) =>
      t.genres.forEach((g) => {
        const arr = groups.get(g) ?? [];
        arr.push(t);
        groups.set(g, arr);
      }),
    );

    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    return {
      categories: sorted.slice(0, 4).map(([genre, list]) => ({ genre, top: list[0] ?? null })),
      rows: sorted.map(([genre, list]) => ({ genre, items: list })),
    };
  }, [data]);

  return (
    <AppShell>
      {/* Category cards — 42:12839 */}
      <div className="flex gap-1 overflow-x-auto pb-1 pt-2 [scrollbar-width:none]">
        {categories.map((c) => (
          <Link
            key={c.genre}
            href={`#genre-${c.genre}`}
            className="group relative h-[156px] w-[259px] flex-shrink-0 px-[7px] py-[6px]"
          >
            <div className="relative h-full w-full overflow-hidden rounded-[8px] bg-[#060608]">
              {!broken[c.genre] && c.top ? (
                <img
                  src={c.top.posterUrl ?? artPoster(`cat-${c.genre}`)}
                  alt=""
                  onError={() => setBroken((b) => ({ ...b, [c.genre]: true }))}
                  className="absolute inset-0 h-full w-full object-cover opacity-50 transition duration-300 group-hover:scale-105 group-hover:opacity-70"
                />
              ) : (
                <div
                  className="absolute inset-0 opacity-60"
                  style={{ background: gradientCss(`cat-${c.genre}`) }}
                />
              )}
              <p className="absolute inset-0 grid place-items-center text-[22px] font-bold text-white">
                {c.genre}
              </p>
            </div>
            <div className="pointer-events-none absolute inset-x-[7px] inset-y-[6px] rounded-[8px] border-[1.7px] border-white/35 opacity-0 transition group-hover:opacity-100" />
          </Link>
        ))}
        {categories.length === 0 && (
          <p className="py-16 text-sm text-white/50">Loading categories…</p>
        )}
      </div>

      {/* Continue Watching row — 42:12925 */}
      {rows.length > 0 && (
        <Row title="Continue Watching">
          {rows[0].items.slice(0, 5).map((t) => (
            <MovieTile key={t.id} item={t} />
          ))}
        </Row>
      )}

      {/* Genre rows — 42:12946 */}
      {rows.map(({ genre, items }) => (
        <Row key={genre} id={`genre-${genre}`} title={genre}>
          {items.map((t) => (
            <MovieTile key={t.id} item={t} />
          ))}
        </Row>
      ))}
    </AppShell>
  );
}

function Row({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-24">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="font-readex text-xl font-medium text-white">{title}</h2>
        <span className="text-lg font-bold text-[#6c6ffc]">See all</span>
      </div>
      <div className="flex gap-[25px] overflow-x-auto pb-2 [scrollbar-width:none]">{children}</div>
    </section>
  );
}

export default function CategoriesPage() {
  return <CategoriesInner />;
}
