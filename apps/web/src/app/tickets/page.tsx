'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Entitlement } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { RequireAuth } from '@/components/RequireAuth';
import { api, ApiError } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

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
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <h1 className="mb-6 text-3xl font-bold tracking-tight text-white">My tickets</h1>
        {error && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-3">
          {items.map((e) => (
            <div
              key={e.titleId + (e.startedAt ?? '')}
              className="flex items-center gap-4 rounded-xl border border-white/8 bg-white/[0.03] p-3 pr-4"
            >
              <div
                className="h-16 w-11 flex-shrink-0 rounded-md"
                style={{ background: gradientCss(e.titleId) }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{e.title?.title ?? 'Title'}</p>
                <p className="text-xs text-white/55">{statusLabel(e)}</p>
              </div>
              {e.status === 'ACTIVE' ? (
                <Link href={`/watch?id=${e.titleId}`}><Button variant="primary">▶ Watch</Button></Link>
              ) : (
                <Link href={`/title?id=${e.titleId}`}><Button variant="ghost">Buy again</Button></Link>
              )}
            </div>
          ))}
          {loaded && items.length === 0 && !error && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] py-14 text-center">
              <div className="text-4xl">🎟️</div>
              <p className="mt-3 text-white/70">No tickets yet.</p>
              <Link href="/browse" className="mt-4 inline-block">
                <Button variant="primary">Find something to watch</Button>
              </Link>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}

export default function TicketsPage() {
  return (
    <RequireAuth>
      <Tickets />
    </RequireAuth>
  );
}
