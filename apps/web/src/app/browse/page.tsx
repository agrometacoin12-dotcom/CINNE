'use client';

import { useEffect, useState } from 'react';
import type { BrowseResponse } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
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
    <AppShell>
      <div className="space-y-9 px-4 py-6 sm:px-8">
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!data && !error && (
          <>
            <div className="h-[60vh] min-h-[440px] animate-pulse rounded-2xl bg-white/[0.05]" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <div className="h-5 w-40 animate-pulse rounded bg-white/10" />
                <div className="flex gap-3">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <div key={j} className="aspect-[2/3] w-[150px] flex-shrink-0 animate-pulse rounded-lg bg-white/[0.05]" />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {data && (
          <>
            {data.hero && <Hero title={data.hero} />}
            {data.rows.map((row, i) => (
              <ContentRow key={row.slug} row={row} index={i} />
            ))}
          </>
        )}
      </div>
    </AppShell>
  );
}
