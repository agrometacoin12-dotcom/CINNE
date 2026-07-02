'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminStats, AdminTitle, AdminUser } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { RequireAdmin } from '@/components/RequireAdmin';
import { api, ApiError, formatPrice } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

/* eslint-disable @next/next/no-img-element */
/**
 * Studio — the admin console in the indigo liquid-glass language
 * (#090b12 · #6c6ffc · lg-glass insets): overview stat cards, then a
 * segmented Movies / Members view. Movies: poster thumb, status pill,
 * price, premiere badge, feature toggle, edit. Members: initials avatar,
 * roles, verification, purchases, joined date, live search.
 */

function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'live' | 'draft' | 'indigo' | 'ok';
}) {
  const tones = {
    neutral: 'bg-white/10 text-white/70',
    live: 'bg-red-500/20 text-red-300',
    draft: 'bg-amber-500/20 text-amber-300',
    indigo: 'bg-[#6c6ffc]/20 text-[#8082ff]',
    ok: 'bg-emerald-500/20 text-emerald-300',
  } as const;
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

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
}: {
  m: AdminTitle;
  busy: boolean;
  onFeature: (m: AdminTitle) => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className="lg-glass flex items-center gap-4 rounded-[16px] p-3.5"
      style={{ background: 'rgba(214,214,214,0.06)' }}
    >
      {/* Poster thumb */}
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

function UserRow({ u }: { u: AdminUser }) {
  const initials = (u.displayName ?? u.email)
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className="lg-glass flex items-center gap-4 rounded-[16px] px-4 py-3"
      style={{ background: 'rgba(214,214,214,0.06)' }}
    >
      <span
        className="lg-glass grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white"
        style={{ background: 'rgba(99,102,241,0.3)' }}
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[14.5px] font-semibold text-white">
            {u.displayName ?? '—'}
          </span>
          {u.roles.map((r) => (
            <Pill key={r} tone={r === 'admin' ? 'indigo' : 'neutral'}>
              {r}
            </Pill>
          ))}
          {!u.emailVerified && <Pill tone="draft">unverified</Pill>}
        </div>
        <p className="mt-0.5 truncate text-xs text-white/50">{u.email}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-6 text-right">
        <div>
          <p className="text-[13px] font-semibold text-white">{u.purchases}</p>
          <p className="text-[10.5px] text-white/45">purchases</p>
        </div>
        <div className="hidden sm:block">
          <p className="text-[13px] font-semibold text-white">
            {new Date(u.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          <p className="text-[10.5px] text-white/45">joined</p>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [tab, setTab] = useState<'movies' | 'users'>('movies');
  const [movies, setMovies] = useState<AdminTitle[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [query, setQuery] = useState('');
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

  // Members search (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .adminUsers(query.trim() || undefined)
        .then((r) => {
          setUsers(r.users);
          setTotalUsers(r.total);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load members'));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

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
        <p className="mt-4 rounded-[12px] border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
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
      <div className="mt-9 flex items-center justify-between gap-4">
        <div className="lg-glass flex h-[46px] items-center rounded-[12px] p-1">
          {(['movies', 'users'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-full rounded-[10px] px-6 text-sm transition ${tab === t ? 'lg-nav-active font-semibold text-white' : 'font-normal text-white/45 hover:text-white/75'}`}
            >
              {t === 'movies' ? `Movies (${movies.length})` : `Members (${totalUsers})`}
            </button>
          ))}
        </div>

        {tab === 'users' && (
          <div
            className="lg-glass flex h-[46px] w-full max-w-[300px] items-center gap-2.5 rounded-[12px] px-4"
            style={{ background: 'rgba(214,214,214,0.07)' }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="text-white/50"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3-3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search members…"
              className="w-full bg-transparent text-[13.5px] text-white outline-none placeholder:text-white/45"
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="mt-5 grid gap-3 pb-8">
        {tab === 'movies' ? (
          <>
            {movies.map((m) => (
              <MovieRow key={m.id} m={m} busy={busyId === m.id} onFeature={toggleFeatured} />
            ))}
            {movies.length === 0 && !error && (
              <p className="py-10 text-center text-sm text-white/50">
                No titles yet. Create your first one.
              </p>
            )}
          </>
        ) : (
          <>
            {users.map((u) => (
              <UserRow key={u.id} u={u} />
            ))}
            {users.length === 0 && (
              <p className="py-10 text-center text-sm text-white/50">
                {query ? `No members matching “${query}”.` : 'No members yet.'}
              </p>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function AdminPage() {
  return (
    <RequireAdmin>
      <AdminDashboard />
    </RequireAdmin>
  );
}
