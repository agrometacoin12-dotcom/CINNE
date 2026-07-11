'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AdminStats, AdminTitle } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { RequireAdmin } from '@/components/RequireAdmin';
import { ActivityTab } from '@/components/admin/ActivityTab';
import { MembersTab } from '@/components/admin/MembersTab';
import { SalesTab } from '@/components/admin/SalesTab';
import { ErrorNote, Pill } from '@/components/admin/ui';
import { api, ApiError, formatPrice } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { gradientCss } from '@/lib/poster';

/* eslint-disable @next/next/no-img-element */
/**
 * Studio — the admin console in the indigo liquid-glass language
 * (#090b12 · #6c6ffc · lg-glass insets): overview stat cards, then a
 * segmented Movies / Members / Sales / Activity console. Movies rows carry a
 * feature toggle, an edit link, and a Sales affordance that deep-links to the
 * Sales tab filtered to that title.
 */

type Tab = 'movies' | 'members' | 'sales' | 'activity';
const TABS: Tab[] = ['movies', 'members', 'sales', 'activity'];
const TAB_LABEL: Record<Tab, string> = {
  movies: 'Movies',
  members: 'Members',
  sales: 'Sales',
  activity: 'Activity',
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="lg-glass rounded-[18px] px-6 py-5"
      style={{ background: 'rgba(214,214,214,0.07)' }}
    >
      <p className="text-[12.5px] font-semibold text-white/55">{label}</p>
      <p className="mt-1.5 font-readex text-[28px] font-bold leading-none text-[#6c6ffc]">
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-white/45">{sub}</p>}
    </div>
  );
}

function MovieRow({
  m,
  busy,
  onFeature,
  onSales,
}: {
  m: AdminTitle;
  busy: boolean;
  onFeature: (m: AdminTitle) => void;
  onSales: (m: AdminTitle) => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className="lg-glass flex items-center gap-4 rounded-[16px] p-3.5"
      style={{ background: 'rgba(214,214,214,0.06)' }}
    >
      <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded-[8px] border border-white/15">
        {m.posterUrl && !broken ? (
          <img
            src={m.posterUrl}
            alt=""
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full" style={{ background: gradientCss(m.id) }} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-white">{m.title}</span>
          <Pill tone={m.status === 'published' ? 'ok' : 'draft'}>{m.status}</Pill>
          {m.featured && <Pill tone="indigo">★ Featured</Pill>}
          {m.isPremiere && (
            <Pill tone={m.premiereLive ? 'live' : 'neutral'}>
              {m.premiereLive ? '● LIVE' : 'Premiere'}
            </Pill>
          )}
          {!m.hasVideo && <Pill tone="draft">No video</Pill>}
        </div>
        <p className="mt-1 text-xs text-white/50">
          {m.year} · {m.type} · {formatPrice(m.priceMinor, m.currency)}
          {m.premiereStartAt ? ` · premiere ${new Date(m.premiereStartAt).toLocaleString()}` : ''}
        </p>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2.5">
        <button
          onClick={() => onSales(m)}
          className="lg-glass h-9 rounded-[10px] px-4 text-[12.5px] font-semibold text-white"
          style={{ background: 'rgba(214,214,214,0.08)' }}
          title="View sales for this title"
        >
          Sales
        </button>
        <button
          onClick={() => onFeature(m)}
          disabled={busy}
          className="lg-glass h-9 rounded-[10px] px-4 text-[12.5px] font-semibold text-white disabled:opacity-50"
          style={{ background: m.featured ? 'rgba(214,214,214,0.08)' : 'rgba(99,102,241,0.22)' }}
        >
          {busy ? '…' : m.featured ? 'Unfeature' : 'Feature'}
        </button>
        <Link
          href={`/admin/movie?id=${m.id}`}
          className="lg-glass grid h-9 place-items-center rounded-[10px] px-4 text-[12.5px] font-semibold text-white"
          style={{ background: 'rgba(214,214,214,0.08)' }}
        >
          Edit
        </Link>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const initialTab = (TABS as string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'movies';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [salesTitleId, setSalesTitleId] = useState<string | undefined>(
    params.get('titleId') ?? undefined,
  );
  const [salesTitleLabel, setSalesTitleLabel] = useState<string | undefined>(undefined);

  const [movies, setMovies] = useState<AdminTitle[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminListMovies()
      .then(setMovies)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load movies'));
    api
      .adminStats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  // Reflect the current tab / title filter in the URL so the view is shareable
  // and the browser back button behaves. Static export → shallow query update.
  useEffect(() => {
    const q = new URLSearchParams();
    if (tab !== 'movies') q.set('tab', tab);
    if (tab === 'sales' && salesTitleId) q.set('titleId', salesTitleId);
    const qs = q.toString();
    router.replace(`/admin${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [tab, salesTitleId, router]);

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

  const openSalesFor = (m: AdminTitle) => {
    setSalesTitleId(m.id);
    setSalesTitleLabel(m.title);
    setTab('sales');
  };

  const revenue =
    stats?.revenue.map((r) => formatPrice(r.totalMinor, r.currency)).join('  ·  ') || '—';

  return (
    <AppShell>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="font-readex text-[28px] font-bold text-white">Studio</h1>
          <p className="mt-1 text-sm text-white/55">
            Upload films, set pay-per-view pricing, schedule premieres, manage members.
          </p>
        </div>
        <Link
          href="/admin/movie"
          className="lg-glass-indigo-35 grid h-11 place-items-center rounded-[12px] px-5 text-sm font-semibold text-white"
        >
          + New movie
        </Link>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {/* Overview */}
      <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Titles"
          value={String(stats?.titles ?? '—')}
          sub={stats ? `${stats.published} published` : undefined}
        />
        <StatCard label="Members" value={String(stats?.users ?? '—')} />
        <StatCard label="Tickets sold" value={String(stats?.purchases ?? '—')} />
        <StatCard label="Active tickets" value={String(stats?.activeEntitlements ?? '—')} />
        <StatCard label="Revenue" value={revenue} sub="paid purchases" />
      </div>

      {/* Segmented tabs */}
      <div className="mt-9 overflow-x-auto">
        <div className="lg-glass inline-flex h-[46px] items-center rounded-[12px] p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-full whitespace-nowrap rounded-[10px] px-5 text-sm transition ${
                tab === t
                  ? 'lg-nav-active font-semibold text-white'
                  : 'font-normal text-white/45 hover:text-white/75'
              }`}
            >
              {t === 'movies' ? `Movies (${movies.length})` : TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mt-5 pb-10">
        {tab === 'movies' && (
          <div className="grid gap-3">
            {movies.map((m) => (
              <MovieRow
                key={m.id}
                m={m}
                busy={busyId === m.id}
                onFeature={toggleFeatured}
                onSales={openSalesFor}
              />
            ))}
            {movies.length === 0 && !error && (
              <p className="py-10 text-center text-sm text-white/50">
                No titles yet. Create your first one.
              </p>
            )}
          </div>
        )}
        {tab === 'members' && <MembersTab selfId={user?.id ?? null} />}
        {tab === 'sales' && (
          <SalesTab
            titleId={salesTitleId}
            titleLabel={salesTitleLabel}
            onClearTitle={() => {
              setSalesTitleId(undefined);
              setSalesTitleLabel(undefined);
            }}
          />
        )}
        {tab === 'activity' && <ActivityTab />}
      </div>
    </AppShell>
  );
}

export default function AdminPage() {
  return (
    <RequireAdmin>
      <Suspense fallback={null}>
        <AdminDashboard />
      </Suspense>
    </RequireAdmin>
  );
}
