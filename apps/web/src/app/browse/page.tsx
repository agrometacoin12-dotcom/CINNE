'use client';

import { useEffect, useState } from 'react';
import type { BrowseResponse } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { Hero } from '@/components/catalogue/Hero';
import { ContentRow } from '@/components/catalogue/ContentRow';
import { api, ApiError } from '@/lib/api';

export default function BrowsePage() {
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .browse()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load catalogue'));
  }, []);

  return (
    <>
      <GlassNav />
      <main className="mx-auto max-w-6xl pb-20 pt-6">
        {error && (
          <p className="px-6 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {!data && !error && (
          <div className="space-y-6">
            <div className="mx-4 h-[360px] animate-pulse rounded-glass bg-white/5 sm:mx-6" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-4 px-4 sm:px-6">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div
                    key={j}
                    className="aspect-[2/3] w-[210px] animate-pulse rounded-2xl bg-white/5"
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {data && (
          <div className="space-y-8">
            {data.hero && <Hero title={data.hero} />}
            {data.rows.map((row, i) => (
              <ContentRow key={row.slug} row={row} index={i} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
