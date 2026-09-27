'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProducerDashboard, ProducerFilm, ProducerWithdrawal } from '@cinnetemple/shared';
import { ViewsChart } from '@/components/producer/ViewsChart';
import { WithdrawSheet } from '@/components/producer/WithdrawSheet';
import { api, ApiError, formatKobo } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

/* eslint-disable @next/next/no-img-element */
/**
 * Producer dashboard — opened from the private link CinneTemple emails a
 * producer (/producer#key=…). No viewer account: the key (from the URL
 * fragment, never sent to servers) is kept for this tab only and sent as a
 * header. Shows total views, ticket sales, 90% earnings, and naira withdrawals.
 */

const KEY_STORE = 'ct.producerKey';

function readKey(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.hash.match(/key=([\w-]{32,128})/);
  if (m?.[1]) {
    try {
      sessionStorage.setItem(KEY_STORE, m[1]);
    } catch {
      /* private mode: keep it in memory only */
    }
    // Drop the key from the address bar so a screenshot or shared URL can't leak it.
    window.history.replaceState(null, '', window.location.pathname);
    return m[1];
  }
  try {
    return sessionStorage.getItem(KEY_STORE);
  } catch {
    return null;
  }
}

const num = (n: number) => n.toLocaleString('en-NG');

function greeting() {
  const h = Number(
    new Date().toLocaleString('en-NG', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Africa/Lagos',
    }),
  );
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return num(n);
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/art/figma/c-logo.png" alt="" className="h-8 w-8 object-contain" />
      <span className="font-logo text-[22px] font-bold leading-none text-white">Cinnetemple</span>
      <span className="ml-1 rounded-full border border-[#e6c878]/30 bg-[#e6c878]/10 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[#e6c878]">
        Producer
      </span>
    </div>
  );
}

function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={`rounded-[24px] border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${className}`}
    >
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-white/45">{label}</p>
      <p className="mt-2 font-readex text-[26px] font-bold leading-none tabular-nums text-white">
        {value}
      </p>
      {sub && <p className="mt-2 text-[12px] text-white/45">{sub}</p>}
    </Card>
  );
}

function Poster({ film }: { film: ProducerFilm }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="h-[92px] w-[64px] flex-shrink-0 overflow-hidden rounded-[10px] border border-white/10 shadow-lg">
      {film.posterUrl && !broken ? (
        <img
          src={film.posterUrl}
          alt=""
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full" style={{ background: gradientCss(film.titleId) }} />
      )}
    </div>
  );
}

const STATUS: Record<ProducerWithdrawal['status'], { label: string; cls: string }> = {
  REQUESTED: { label: 'Processing', cls: 'bg-amber-400/15 text-amber-300' },
  PAID: { label: 'Paid', cls: 'bg-emerald-400/15 text-emerald-300' },
  REJECTED: { label: 'Declined', cls: 'bg-red-400/15 text-red-300' },
};

function Skeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-5 pt-28 sm:px-8">
      <div className="h-8 w-64 rounded-lg bg-white/[0.06]" />
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="h-64 rounded-[24px] bg-white/[0.05]" />
        <div className="h-64 rounded-[24px] bg-white/[0.05]" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-[24px] bg-white/[0.05]" />
        ))}
      </div>
    </div>
  );
}

function Gate({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 w-fit">
          <Brand />
        </div>
        <h1 className="font-readex text-2xl font-bold text-white">{title}</h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-white/60">{body}</p>
        <a
          href="mailto:support@cinnetemple.com?subject=Producer%20dashboard%20link"
          className="mt-6 inline-flex h-11 items-center rounded-full border border-white/15 px-6 text-[14px] font-semibold text-white hover:bg-white/[0.06]"
        >
          Contact CinneTemple
        </a>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ProducerPage() {
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [data, setData] = useState<ProducerDashboard | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => setKey(readKey()), []);

  const load = useCallback(() => {
    if (!key) return;
    api
      .producerDashboard(key)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) =>
        setError(
          e instanceof ApiError
            ? { status: e.status, message: e.message }
            : { status: 0, message: 'Could not reach CinneTemple. Check your connection.' },
        ),
      );
  }, [key]);
  useEffect(load, [load]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07080d] text-white">
      {/* Ambient light — two soft glows, no images, cheap on low-end phones. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_20%_0%,rgba(108,111,252,0.22),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-40 h-[420px] w-[520px] bg-[radial-gradient(50%_50%_at_70%_30%,rgba(230,200,120,0.10),transparent_70%)]"
      />

      {key === null && (
        <Gate
          title="Open your dashboard link"
          body="Your producer dashboard opens from the private link CinneTemple emailed you. Open that email on this device and tap the link."
        />
      )}
      {key && error?.status === 401 && (
        <Gate title="This link has been replaced" body={error.message} />
      )}
      {key &&
        !data &&
        !(error?.status === 401) &&
        (error ? <Gate title="Something went wrong" body={error.message} /> : <Skeleton />)}

      {data && key && (
        <>
          <header className="relative z-10 border-b border-white/[0.06] bg-[#07080d]/70 backdrop-blur-xl">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
              <Brand />
              <div className="hidden text-right sm:block">
                <p className="text-[13.5px] font-semibold text-white">
                  {data.producer.name ?? data.producer.email}
                </p>
                {data.producer.name && (
                  <p className="text-[12px] text-white/45">{data.producer.email}</p>
                )}
              </div>
            </div>
          </header>

          <main className="relative z-10 mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] text-white/50">
                  {new Date().toLocaleDateString('en-NG', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'Africa/Lagos',
                  })}
                </p>
                <h1 className="mt-1 font-readex text-[30px] font-bold leading-tight sm:text-[36px]">
                  {greeting()}
                  {data.producer.name ? `, ${data.producer.name.split(' ')[0]}` : ''}
                </h1>
              </div>
              <button
                type="button"
                onClick={load}
                className="h-10 rounded-full border border-white/12 px-4 text-[13px] font-medium text-white/70 hover:bg-white/[0.06] hover:text-white"
              >
                Refresh
              </button>
            </div>

            {/* Hero: total views + money */}
            <div className="mt-8 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <Card className="relative overflow-clip p-7 sm:p-9">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#6c6ffc]/20 blur-3xl"
                />
                <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[#a5a7ff]">
                  Total views
                </p>
                <p className="mt-3 bg-gradient-to-b from-white to-white/70 bg-clip-text font-readex text-[64px] font-extrabold leading-none tracking-tight tabular-nums text-transparent sm:text-[88px]">
                  {num(data.totals.views)}
                </p>
                <p className="mt-4 text-[14px] text-white/60">
                  across {data.films.length} {data.films.length === 1 ? 'film' : 'films'}
                  {data.totals.views > 0 && (
                    <>
                      {' · '}
                      <span className="text-white/80">{num(data.totals.completedViews)}</span>{' '}
                      watched to the end
                    </>
                  )}
                </p>
              </Card>

              <Card className="relative flex flex-col justify-between overflow-clip p-7">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-[#e6c878]/10 blur-3xl"
                />
                <div>
                  <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-[#e6c878]">
                    Available to withdraw
                  </p>
                  <p className="mt-3 font-readex text-[44px] font-extrabold leading-none tabular-nums text-white">
                    {formatKobo(data.balance.availableMinor)}
                  </p>
                  <dl className="mt-5 grid gap-2 text-[13px]">
                    <div className="flex justify-between">
                      <dt className="text-white/50">Total earned</dt>
                      <dd className="tabular-nums text-white/85">
                        {formatKobo(data.balance.earnedMinor)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/50">Processing</dt>
                      <dd className="tabular-nums text-white/85">
                        {formatKobo(data.balance.requestedMinor)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/50">Paid to you</dt>
                      <dd className="tabular-nums text-white/85">
                        {formatKobo(data.balance.paidMinor)}
                      </dd>
                    </div>
                  </dl>
                </div>
                <button
                  type="button"
                  onClick={() => setWithdrawing(true)}
                  disabled={data.balance.availableMinor < data.balance.minWithdrawalMinor}
                  className="mt-6 h-12 rounded-[14px] bg-gradient-to-r from-[#e6c878] to-[#c9a24e] text-[15px] font-semibold text-[#1a1406] shadow-[0_10px_34px_-10px_rgba(230,200,120,0.55)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
                >
                  Withdraw to bank
                </button>
                {data.balance.availableMinor < data.balance.minWithdrawalMinor && (
                  <p className="mt-2 text-center text-[11.5px] text-white/40">
                    Withdrawals open from {formatKobo(data.balance.minWithdrawalMinor)}
                  </p>
                )}
              </Card>
            </div>

            {/* KPIs */}
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Tickets sold" value={compact(data.totals.ticketsSold)} />
              <Stat
                label="Ticket sales"
                value={formatKobo(data.totals.grossMinor)}
                sub="Gross, before shares"
              />
              <Stat
                label="Completion"
                value={
                  data.totals.views
                    ? `${Math.round((data.totals.completedViews / data.totals.views) * 100)}%`
                    : '—'
                }
                sub="Viewers who finished"
              />
              <Stat
                label="Your earnings"
                value={formatKobo(data.totals.earningsMinor)}
                sub="All time"
              />
            </div>

            {/* Chart */}
            <Card className="mt-4 p-6 sm:p-7">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-readex text-lg font-semibold">Views, last 30 days</h2>
                <p className="text-[13px] text-white/50">
                  {num(data.dailyViews.reduce((s, d) => s + d.views, 0))} in 30 days
                </p>
              </div>
              <ViewsChart data={data.dailyViews} />
            </Card>

            {/* Films */}
            <h2 className="mb-4 mt-12 font-readex text-xl font-semibold">Your films</h2>
            <div className="grid gap-3">
              {data.films.map((f) => (
                <Card
                  key={f.titleId}
                  className="flex flex-wrap items-center gap-5 p-4 sm:flex-nowrap sm:p-5"
                >
                  <Poster film={f} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-readex text-[17px] font-semibold">{f.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-white/45">
                      {f.type === 'series' ? 'Series' : 'Film'}
                      {f.year ? ` · ${f.year}` : ''} · You earn {f.revenueShareBps / 100}% of ticket
                      sales
                    </p>
                  </div>
                  <dl className="grid w-full grid-cols-3 gap-4 text-right sm:w-auto sm:min-w-[360px]">
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.1em] text-white/40">
                        Views
                      </dt>
                      <dd className="mt-1 font-readex text-[18px] font-bold tabular-nums">
                        {num(f.views)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.1em] text-white/40">
                        Tickets
                      </dt>
                      <dd className="mt-1 font-readex text-[18px] font-bold tabular-nums">
                        {num(f.ticketsSold)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-[0.1em] text-white/40">
                        Earned
                      </dt>
                      <dd className="mt-1 font-readex text-[18px] font-bold tabular-nums text-[#e6c878]">
                        {formatKobo(f.earningsMinor)}
                      </dd>
                    </div>
                  </dl>
                </Card>
              ))}
            </div>

            {/* Withdrawals */}
            <h2 className="mb-4 mt-12 font-readex text-xl font-semibold">Withdrawals</h2>
            <Card className="overflow-hidden">
              {data.withdrawals.length === 0 ? (
                <p className="px-6 py-10 text-center text-[14px] text-white/50">
                  No withdrawals yet. When you withdraw, it shows up here with its status.
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {data.withdrawals.map((w) => (
                    <li
                      key={w.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"
                    >
                      <div className="min-w-0">
                        <p className="font-readex text-[16px] font-semibold tabular-nums">
                          {formatKobo(w.amountMinor)}
                        </p>
                        <p className="truncate text-[12.5px] text-white/50">
                          {w.bankName} ••••{w.accountNumber.slice(-4)} ·{' '}
                          {new Date(w.requestedAt ?? w.createdAt).toLocaleDateString('en-NG', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {w.status === 'PAID' && w.transferRef ? ` · ref ${w.transferRef}` : ''}
                          {w.status === 'REJECTED' && w.note ? ` · ${w.note}` : ''}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[12px] font-semibold ${STATUS[w.status].cls}`}
                      >
                        {STATUS[w.status].label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <footer className="mt-12 grid gap-2 border-t border-white/[0.06] pt-6 text-[12.5px] leading-relaxed text-white/40">
              <p>
                You earn your share of every ticket sold. Web and Android tickets count in full;
                iPhone tickets count after Apple’s App Store fee. Views are tickets that started
                playing.
              </p>
              <p>
                Keep this link private. Withdrawals always need a code sent to your email.
                Questions?{' '}
                <a
                  href="mailto:support@cinnetemple.com"
                  className="text-white/65 underline-offset-2 hover:underline"
                >
                  support@cinnetemple.com
                </a>
              </p>
            </footer>
          </main>

          {withdrawing && (
            <WithdrawSheet
              producerKey={key}
              data={data}
              onClose={() => setWithdrawing(false)}
              onDone={setData}
            />
          )}
        </>
      )}
    </div>
  );
}
