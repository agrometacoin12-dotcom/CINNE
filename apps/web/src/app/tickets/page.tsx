'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Entitlement } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { RequireAuth } from '@/components/RequireAuth';
import { api, ApiError } from '@/lib/api';

function Tickets() {
  const [items, setItems] = useState<Entitlement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .entitlements()
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load tickets'))
      .finally(() => setLoaded(true));
  }, []);

  const statusLabel = (e: Entitlement) => {
    if (e.status === 'ACTIVE' && !e.startedAt) return 'Unused · watch anytime';
    if (e.status === 'ACTIVE') return `Watching · until ${e.expiresAt ? new Date(e.expiresAt).toLocaleString() : ''}`;
    if (e.status === 'EXPIRED') return 'Window ended';
    return e.status;
  };

  return (
    <>
      <GlassNav />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 sm:px-6">
        <h1 className="mb-4 text-3xl font-extrabold">My tickets</h1>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-3">
          {items.map((e) => (
            <GlassPanel key={e.titleId + (e.startedAt ?? '')} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold">{e.title?.title ?? 'Title'}</p>
                <p className="text-xs text-[var(--text-secondary)]">{statusLabel(e)}</p>
              </div>
              {e.status === 'ACTIVE' ? (
                <Link href={`/watch?id=${e.titleId}`}><Button variant="primary">▶ Watch</Button></Link>
              ) : (
                <Link href={`/title?id=${e.titleId}`}><Button variant="ghost">Buy again</Button></Link>
              )}
            </GlassPanel>
          ))}
          {loaded && items.length === 0 && !error && (
            <p className="text-sm text-[var(--text-secondary)]">
              No tickets yet. <Link href="/browse" className="underline">Find something to watch.</Link>
            </p>
          )}
        </div>
      </main>
    </>
  );
}

export default function TicketsPage() {
  return (
    <RequireAuth>
      <Tickets />
    </RequireAuth>
  );
}
