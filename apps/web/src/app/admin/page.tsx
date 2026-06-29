'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminTitle } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { RequireAdmin } from '@/components/RequireAdmin';
import { api, ApiError, formatPrice } from '@/lib/api';

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'live' | 'draft' | 'gold' }) {
  const tones = {
    neutral: 'bg-white/10 text-white/70',
    live: 'bg-red-500/20 text-red-300',
    draft: 'bg-amber-500/20 text-amber-300',
    gold: 'bg-yellow-400/20 text-yellow-200',
  } as const;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

function AdminDashboard() {
  const [movies, setMovies] = useState<AdminTitle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminListMovies()
      .then(setMovies)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load movies'));
  }, []);

  useEffect(load, [load]);

  const toggleFeatured = async (m: AdminTitle) => {
    setBusyId(m.id);
    try {
      await api.adminSetFeatured(m.id, !m.featured);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <GlassNav />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold">Studio</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Upload films, set pay-per-view pricing, schedule premieres.
            </p>
          </div>
          <Link href="/admin/movie">
            <Button variant="primary">+ New movie</Button>
          </Link>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <div className="mt-4 grid gap-3">
          {movies.map((m) => (
            <GlassPanel key={m.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{m.title}</span>
                  <Badge tone={m.status === 'published' ? 'neutral' : 'draft'}>{m.status}</Badge>
                  {m.featured && <Badge tone="gold">★ Featured</Badge>}
                  {m.isPremiere && <Badge tone={m.premiereLive ? 'live' : 'neutral'}>{m.premiereLive ? '● LIVE' : 'Premiere'}</Badge>}
                  {!m.hasVideo && <Badge tone="draft">No video</Badge>}
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {m.year} · {m.type} · {formatPrice(m.priceMinor, m.currency)}
                  {m.premiereStartAt ? ` · premiere ${new Date(m.premiereStartAt).toLocaleString()}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="glass"
                  loading={busyId === m.id}
                  onClick={() => toggleFeatured(m)}
                >
                  {m.featured ? 'Unfeature' : 'Feature'}
                </Button>
                <Link href={`/admin/movie?id=${m.id}`}>
                  <Button variant="ghost">Edit</Button>
                </Link>
              </div>
            </GlassPanel>
          ))}
          {movies.length === 0 && !error && (
            <p className="text-sm text-[var(--text-secondary)]">No titles yet. Create your first one.</p>
          )}
        </div>
      </main>
    </>
  );
}

export default function AdminPage() {
  return (
    <RequireAdmin>
      <AdminDashboard />
    </RequireAdmin>
  );
}
