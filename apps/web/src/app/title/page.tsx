'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Title } from '@cinnetemple/shared';
import { AppShell } from '@/components/app/AppShell';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError, formatPrice } from '@/lib/api';
import { artPoster, gradientCss } from '@/lib/poster';

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function TitleDetail() {
  const id = useSearchParams().get('id') ?? '';
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState<Title | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [buying, setBuying] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftEmail, setGiftEmail] = useState('');
  const [heroBroken, setHeroBroken] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.title(id).then(setTitle).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load title'));
  }, [id]);

  useEffect(() => {
    if (!id || !user) return;
    api.playbackStatus(id).then((s) => setHasAccess(s.hasAccess)).catch(() => undefined);
  }, [id, user]);

  const requireLogin = () => { if (!user) { router.push('/login'); return true; } return false; };
  const watchDest = () => (title?.isPremiere ? `/premiere?id=${id}` : `/watch?id=${id}`);

  const toggleWatchlist = async () => {
    if (requireLogin()) return;
    setSaving(true);
    try {
      if (saved) { await api.removeFromWatchlist(id); setSaved(false); }
      else { await api.addToWatchlist(id); setSaved(true); }
    } finally { setSaving(false); }
  };

  const buy = async (beneficiaryEmail?: string) => {
    if (requireLogin()) return;
    setBuying(true); setError(null); setNotice(null);
    try {
      const r = await api.purchase(id, beneficiaryEmail);
      if (r.status === 'pending' && r.authorizationUrl) { window.location.href = r.authorizationUrl; return; }
      if (r.status === 'paid' || r.status === 'already_entitled') {
        if (beneficiaryEmail) { setNotice(`Gift sent to ${beneficiaryEmail}.`); setGiftOpen(false); setGiftEmail(''); }
        else { setHasAccess(true); router.push(watchDest()); }
      } else if (r.status === 'failed') setError('Payment could not be started.');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Purchase failed'); }
    finally { setBuying(false); }
  };

  const onPlay = () => { if (hasAccess) router.push(watchDest()); else void buy(); };

  const meta = title
    ? [String(title.year), title.genres[0], title.runtimeMinutes ? `${Math.floor(title.runtimeMinutes / 60)}h ${title.runtimeMinutes % 60}m` : null, title.maturityRating].filter(Boolean).join(' • ')
    : '';

  const similar = [1, 2, 3].map((k) => `${id}-sim-${k}`);

  return (
    <AppShell>
      <div className="px-4 pb-16 pt-4 sm:px-8">
        {error && !title && <p className="text-sm text-red-400">{error}</p>}

        {title && (
          <>
            {/* Hero banner */}
            <section className="relative h-[430px] w-full overflow-hidden rounded-[20px] bg-[#090b12]">
              {!heroBroken ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/art/hero/${title.id}.jpg`} alt={title.title} onError={() => setHeroBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0" style={{ background: gradientCss(title.id) }} />
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(9,11,18,0.96) 0%, rgba(9,11,18,0.55) 55%, rgba(9,11,18,0) 100%)' }} />
              <div className="relative flex h-full max-w-xl flex-col justify-center px-12">
                <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#6c6ffc]">{title.type}</span>
                <h1 className="mt-2 font-readex text-[44px] font-bold leading-[1.1] text-white">{title.title}</h1>
                <p className="mt-3 text-sm text-white/70">
                  {meta}{title.rating > 0 && <> • <span className="text-[#fbbf24]">★</span> {title.rating.toFixed(1)}</>}
                </p>
                <p className="mt-4 max-w-md text-sm leading-[1.6] text-white/85 line-clamp-3">{title.overview}</p>
                <div className="mt-7 flex items-center gap-4">
                  <button onClick={onPlay} disabled={buying} className="lg-glass-indigo flex h-12 w-[150px] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60">
                    {hasAccess ? '▶ Play Now' : title.priceMinor > 0 ? `▶ ${formatPrice(title.priceMinor, title.currency)}` : '▶ Play Now'}
                  </button>
                  <button onClick={() => setGiftOpen((v) => !v)} className="lg-glass flex h-12 w-[150px] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white">
                    🎁 Gift
                  </button>
                  <button onClick={toggleWatchlist} disabled={saving} title="Save to My List" className="lg-glass flex h-12 w-12 items-center justify-center rounded-xl text-sm text-white">
                    {saved ? '✓' : '♡'}
                  </button>
                </div>
              </div>
            </section>

            {notice && <p className="mt-4 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white">{notice}</p>}
            {error && <p className="mt-4 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white">{error}</p>}

            {giftOpen && (
              <div className="mt-6 max-w-xl rounded-2xl border border-[#121724] bg-[#0a0d14] p-5">
                <p className="text-sm text-white/60">Gift this ticket to another member — they can watch it once.</p>
                <div className="mt-3"><TextField label="Recipient email" type="email" value={giftEmail} onChange={(e) => setGiftEmail(e.target.value)} placeholder="friend@example.com" /></div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => buy(giftEmail.trim())} disabled={buying || !giftEmail.trim()} className="lg-glass-indigo rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Send gift · {formatPrice(title.priceMinor, title.currency)}</button>
                  <button onClick={() => setGiftOpen(false)} className="rounded-xl px-4 py-2.5 text-sm text-white/60 hover:text-white">Cancel</button>
                </div>
              </div>
            )}

            {/* Storyline + Cast + More like this */}
            <div className="mt-10 flex flex-col gap-10 lg:flex-row">
              <div className="min-w-0 flex-1">
                <h2 className="font-readex text-xl font-medium text-white">Storyline</h2>
                <p className="mt-3 max-w-2xl text-sm leading-[1.7] text-white/70">{title.overview}</p>

                {title.cast.length > 0 && (
                  <>
                    <h2 className="mt-10 font-readex text-xl font-medium text-white">Cast</h2>
                    <div className="mt-5 flex flex-wrap gap-x-8 gap-y-5">
                      {title.cast.map((c) => (
                        <div key={c} className="flex w-16 flex-col items-center gap-2 text-center">
                          <span className="lg-glass grid h-14 w-14 place-items-center rounded-full text-[15px] font-semibold text-white/90">{initials(c)}</span>
                          <span className="text-[11px] text-white/60">{c}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <aside className="lg:w-[380px]">
                <h2 className="font-readex text-xl font-medium text-white">More Like This</h2>
                <div className="mt-5 flex gap-4">
                  {similar.map((seed) => (
                    <Link key={seed} href="/browse" className="group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={artPoster(seed)} alt="" className="h-[158px] w-[118px] rounded-xl object-cover ring-1 ring-white/5 transition group-hover:ring-2 group-hover:ring-[#6366f1]" />
                      <p className="mt-2 text-center text-xs text-white/60">★ {(7 + (seed.length % 3) + 0.2).toFixed(1)}</p>
                    </Link>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function TitlePage() {
  return (
    <Suspense fallback={null}>
      <TitleDetail />
    </Suspense>
  );
}
