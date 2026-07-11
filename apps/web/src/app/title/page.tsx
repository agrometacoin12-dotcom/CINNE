'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { Title, TitleSummary } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { MovieTile } from '@/components/catalogue/MovieTile';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError, formatPrice } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const TABS = [
  { label: 'Home', href: '/browse' },
  { label: 'Movies', href: '/categories' },
  { label: 'TV Shows', href: '/categories?type=series' },
  { label: 'My List', href: '/watchlist' },
];

/* eslint-disable @next/next/no-img-element */
/**
 * Movie Detail — exact Figma web frame 42:14056 on desktop (hero banner
 * 1099×430 with MOVIE label, Manrope 44 title, meta dots, ▶ Play Now /
 * ↓ Download / ♡ buttons, Storyline, Cast initial circles, "More Like This"
 * right rail) and iPhone frame 42:13650 on mobile (full-bleed hero, glass
 * back/save, floating bottom tabs).
 */
function TitleDetail() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [title, setTitle] = useState<Title | null>(null);
  const [similar, setSimilar] = useState<TitleSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [buying, setBuying] = useState(false);
  const [heroBroken, setHeroBroken] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .title(id)
      .then(setTitle)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load title'));
    api
      .browse()
      .then((b) => {
        const seen = new Set<string>([id]);
        const rest: TitleSummary[] = [];
        b.rows.forEach((r) =>
          r.items.forEach((t) => {
            if (!seen.has(t.id)) {
              seen.add(t.id);
              rest.push(t);
            }
          }),
        );
        setSimilar(rest.slice(0, 3));
      })
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    if (!id || !user) return;
    api
      .playbackStatus(id)
      .then((s) => setHasAccess(s.hasAccess))
      .catch(() => undefined);
    // Reflect the real saved state so an already-listed title shows a filled
    // heart and toggles off correctly.
    api
      .watchlist()
      .then((list) => setSaved(list.some((w) => w.titleId === id)))
      .catch(() => undefined);
  }, [id, user]);

  const requireLogin = () => {
    if (!user) {
      router.push('/login');
      return true;
    }
    return false;
  };
  const watchDest = () => (title?.isPremiere ? `/premiere?id=${id}` : `/watch?id=${id}`);

  const toggleWatchlist = async () => {
    if (requireLogin()) return;
    if (saved) {
      await api.removeFromWatchlist(id);
      setSaved(false);
    } else {
      await api.addToWatchlist(id);
      setSaved(true);
    }
  };

  const buy = async () => {
    if (requireLogin()) return;
    setBuying(true);
    setError(null);
    try {
      const r = await api.purchase(id);
      if (r.status === 'pending' && r.authorizationUrl) {
        window.location.href = r.authorizationUrl;
        return;
      }
      if (r.status === 'paid' || r.status === 'already_entitled') {
        setHasAccess(true);
        router.push(watchDest());
      } else if (r.status === 'failed') setError('Payment could not be started.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Purchase failed');
    } finally {
      setBuying(false);
    }
  };

  const onPlay = () => {
    if (hasAccess) router.push(watchDest());
    else void buy();
  };

  const runtime = title?.runtimeMinutes
    ? `${Math.floor(title.runtimeMinutes / 60)}h ${title.runtimeMinutes % 60}m`
    : null;
  const metaParts = title
    ? ([String(title.year), title.genres[0], runtime, title.maturityRating].filter(
        Boolean,
      ) as string[])
    : [];
  const playLabel =
    hasAccess || !title || title.priceMinor <= 0
      ? 'Play Now'
      : formatPrice(title.priceMinor, title.currency);
  const active = (href: string) => pathname === href.split('?')[0];

  const heroImg = (cls: string) =>
    title && !heroBroken ? (
      <img
        src={`/art/hero/${title.id}.jpg`}
        alt={title.title}
        onError={() => setHeroBroken(true)}
        className={cls}
      />
    ) : (
      <div className={cls} style={{ background: title ? gradientCss(title.id) : '#090b12' }} />
    );

  return (
    <>
      {/* ── Desktop — Figma 42:14056 ── */}
      <div className="hidden lg:block">
        <AppShell>
          {error && !title && <p className="pt-4 text-sm text-red-400">{error}</p>}
          {title && (
            <div className="grid grid-cols-[1fr_386px] gap-x-0">
              {/* Hero banner spans both columns */}
              <div className="relative col-span-2 mt-0 h-[430px] overflow-hidden rounded-[20px] bg-[#090b12]">
                {heroImg('absolute inset-0 h-full w-full object-cover')}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, rgba(9,11,18,0.96) 0%, rgba(9,11,18,0.55) 55%, rgba(9,11,18,0) 100%)',
                  }}
                />
                <div className="relative pl-12 pt-16">
                  <p className="text-[13px] font-semibold tracking-[1.56px] text-[#6c6ffc]">
                    {title.type === 'series' ? 'SERIES' : 'MOVIE'}
                  </p>
                  <h1 className="mt-1 font-readex text-[44px] font-bold text-white">
                    {title.title}
                  </h1>
                  <p className="mt-1 text-sm text-white/70">
                    {metaParts.join('  •  ')}
                    {title.rating > 0 && `  •  ★ ${title.rating.toFixed(1)}`}
                  </p>
                  <p className="mt-2 max-w-[420px] text-sm leading-[1.6] text-white/85 line-clamp-3">
                    {title.overview}
                  </p>
                  <div className="mt-9 flex gap-4">
                    <button
                      onClick={onPlay}
                      disabled={buying}
                      className="lg-glass-indigo h-12 w-[150px] rounded-[12px] text-sm font-semibold text-white disabled:opacity-60"
                    >
                      ▶&nbsp;&nbsp;{playLabel}
                    </button>
                    <button
                      onClick={onPlay}
                      className="lg-glass h-12 w-[150px] rounded-[12px] text-sm font-semibold text-white"
                    >
                      ↓&nbsp;&nbsp;Download
                    </button>
                    <button
                      onClick={toggleWatchlist}
                      aria-label="Save"
                      className="lg-glass h-12 w-12 rounded-[12px] text-sm font-semibold text-white"
                    >
                      {saved ? '♥' : '♡'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Left column: Storyline + Cast */}
              <div className="pt-9">
                <h2 className="font-readex text-xl font-medium text-white">Storyline</h2>
                <p className="mt-2.5 max-w-[640px] text-sm leading-[1.7] text-white/70">
                  {title.overview}
                </p>

                {title.cast.length > 0 && (
                  <>
                    <h2 className="mt-12 font-readex text-xl font-medium text-white">Cast</h2>
                    <div className="mt-2.5 flex flex-wrap gap-x-[72px] gap-y-5">
                      {title.cast.map((c) => (
                        <div key={c} className="w-14 text-center">
                          <span className="lg-glass grid h-14 w-14 place-items-center rounded-[28px] text-[15px] font-semibold text-white/90">
                            {initials(c)}
                          </span>
                          <p className="mt-2 w-[108px] -translate-x-1/4 text-[11px] text-white/60">
                            {c}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {error && (
                  <p className="mt-4 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white">
                    {error}
                  </p>
                )}
              </div>

              {/* Right rail: More Like This */}
              <div className="pl-8 pt-9">
                <h2 className="font-readex text-xl font-medium text-white">More Like This</h2>
                <div className="mt-2.5 flex gap-4">
                  {similar.map((s) => (
                    <div key={s.id}>
                      <MovieTile item={s} w={118} h={158} />
                      {s.rating > 0 && (
                        <p className="mt-2 text-center text-xs text-white/60">
                          ★ {s.rating.toFixed(1)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </AppShell>
      </div>

      {/* ── Mobile — Figma 42:13650 ── */}
      <div className="flex min-h-screen justify-center bg-[#090b12] text-white lg:hidden">
        <div className="relative w-full max-w-[430px] pb-28">
          {error && !title && <p className="p-4 text-sm text-red-400">{error}</p>}

          {title && (
            <>
              <div className="relative h-[470px] w-full">
                {heroImg('absolute inset-0 h-full w-full object-cover')}
                <div
                  className="absolute inset-x-0 top-[170px] h-[300px]"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(9,11,18,0) 0%, rgba(9,11,18,0.9) 75%, #090b12 100%)',
                  }}
                />
                <button
                  onClick={() => router.back()}
                  aria-label="Back"
                  className="lg-glass absolute left-4 top-14 grid h-10 w-10 place-items-center rounded-[20px] text-lg text-white"
                >
                  ←
                </button>
                <button
                  onClick={toggleWatchlist}
                  aria-label="Save"
                  className="lg-glass absolute right-4 top-14 grid h-10 w-10 place-items-center rounded-[20px] text-lg text-white"
                >
                  {saved ? '♥' : '♡'}
                </button>
              </div>

              <div className="-mt-6 px-4">
                <h1 className="font-readex text-[24px] font-bold text-white">{title.title}</h1>
                <p className="mt-1.5 text-[12.5px] text-white/60">{metaParts.join('  •  ')}</p>
                {title.rating > 0 && (
                  <p className="mt-1.5 text-[12.5px] font-semibold text-[#6c6ffc]">
                    ★ {title.rating.toFixed(1)}/10&nbsp;&nbsp;IMDb
                  </p>
                )}

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={onPlay}
                    disabled={buying}
                    className="lg-glass-indigo flex h-[46px] flex-1 items-center justify-center gap-2 rounded-[12px] text-[14px] font-semibold text-white disabled:opacity-60"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7L8 5Z" />
                    </svg>
                    {playLabel}
                  </button>
                  <button
                    onClick={onPlay}
                    className="lg-glass flex h-[46px] flex-1 items-center justify-center gap-2 rounded-[12px] text-[14px] font-semibold text-white"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                    </svg>
                    Download
                  </button>
                </div>

                {error && (
                  <p className="mt-3 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white">
                    {error}
                  </p>
                )}

                <h2 className="mt-8 font-readex text-[16px] font-medium text-white">Storyline</h2>
                <p className="mt-3 text-[12.5px] leading-[1.5] text-white/65">{title.overview}</p>

                {title.cast.length > 0 && (
                  <>
                    <h2 className="mt-8 font-readex text-[16px] font-medium text-white">Cast</h2>
                    <div className="mt-4 flex flex-wrap gap-x-12 gap-y-4">
                      {title.cast.map((c) => (
                        <span
                          key={c}
                          className="lg-glass grid h-11 w-11 place-items-center rounded-[22px] text-[13px] font-semibold text-white/90"
                          title={c}
                        >
                          {initials(c)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          <div className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-28px)] max-w-[402px] -translate-x-1/2 items-center justify-between rounded-[12px] lg-glass p-1">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`flex-1 rounded-[13px] py-2.5 text-center text-[14px] transition ${active(t.href) ? 'font-semibold text-white lg-nav-active' : 'font-normal text-white/40'}`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function TitlePage() {
  return (
    <Suspense fallback={null}>
      <TitleDetail />
    </Suspense>
  );
}
