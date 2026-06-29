'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import type { Title } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Alert } from '@/components/ui/Alert';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError, formatPrice } from '@/lib/api';

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

  useEffect(() => {
    if (!id) return;
    api
      .title(id)
      .then(setTitle)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load title'));
  }, [id]);

  useEffect(() => {
    if (!id || !user) return;
    api.playbackStatus(id).then((s) => setHasAccess(s.hasAccess)).catch(() => undefined);
  }, [id, user]);

  const requireLogin = () => {
    if (!user) {
      router.push('/login');
      return true;
    }
    return false;
  };

  const toggleWatchlist = async () => {
    if (requireLogin()) return;
    setSaving(true);
    try {
      if (saved) {
        await api.removeFromWatchlist(id);
        setSaved(false);
      } else {
        await api.addToWatchlist(id);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const watchDestination = () => (title?.isPremiere ? `/premiere?id=${id}` : `/watch?id=${id}`);

  const buy = async (beneficiaryEmail?: string) => {
    if (requireLogin()) return;
    setBuying(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.purchase(id, beneficiaryEmail);
      if (result.status === 'pending' && result.authorizationUrl) {
        window.location.href = result.authorizationUrl; // → Paystack / mock checkout
        return;
      }
      if (result.status === 'paid' || result.status === 'already_entitled') {
        if (beneficiaryEmail) {
          setNotice(`Gift sent to ${beneficiaryEmail}. They can watch it now.`);
          setGiftOpen(false);
          setGiftEmail('');
        } else {
          setHasAccess(true);
          router.push(watchDestination());
        }
      } else if (result.status === 'failed') {
        setError('Payment could not be started. Please try again.');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Purchase failed');
    } finally {
      setBuying(false);
    }
  };

  return (
    <>
      <GlassNav />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6">
        {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
        {notice && <div className="mb-3"><Alert tone="success">{notice}</Alert></div>}
        {title && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <div
              className="relative h-[300px] overflow-hidden rounded-glass border border-white/10"
              style={{ background: 'linear-gradient(120deg,#1a1030,#3a1020 60%,#0a0a0b)' }}
            >
              {title.heroUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={title.heroUrl} alt={title.title} className="absolute inset-0 h-full w-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="absolute bottom-0 p-6">
                {title.isPremiere && (
                  <span className={`mb-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${title.premiereLive ? 'bg-red-500/25 text-red-200' : 'bg-white/15 text-white/80'}`}>
                    {title.premiereLive ? '● LIVE PREMIERE' : 'PREMIERE'}
                    {!title.premiereLive && title.premiereStartAt ? ` · ${new Date(title.premiereStartAt).toLocaleString()}` : ''}
                  </span>
                )}
                <h1 className="text-4xl font-extrabold">{title.title}</h1>
                {title.tagline && <p className="mt-1 text-white/80">{title.tagline}</p>}
              </div>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-[2fr_1fr]">
              <GlassPanel className="p-6">
                <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
                  <span className="capitalize">{title.type}</span>
                  <span>{title.year}</span>
                  {title.rating > 0 && <span>★ {title.rating.toFixed(1)}</span>}
                  {title.maturityRating && <span className="glass rounded px-2 py-0.5 text-xs">{title.maturityRating}</span>}
                  {title.runtimeMinutes && <span>{title.runtimeMinutes} min</span>}
                  <span className="font-semibold text-[var(--text-primary)]">{formatPrice(title.priceMinor, title.currency)}</span>
                </div>
                <p className="mt-4 leading-relaxed">{title.overview}</p>

                <div className="mt-5 flex flex-wrap gap-3">
                  {hasAccess ? (
                    <Button variant="primary" onClick={() => router.push(watchDestination())}>
                      ▶ {title.isPremiere ? 'Enter premiere' : 'Watch now'}
                    </Button>
                  ) : title.isPremiere && !title.premiereLive ? (
                    <Button variant="primary" loading={buying} onClick={() => buy()}>
                      🎟️ Reserve · {formatPrice(title.priceMinor, title.currency)}
                    </Button>
                  ) : (
                    <Button variant="primary" loading={buying} onClick={() => buy()}>
                      🎟️ {title.priceMinor > 0 ? `Buy ticket · ${formatPrice(title.priceMinor, title.currency)}` : 'Watch free'}
                    </Button>
                  )}
                  <Button variant="glass" onClick={() => setGiftOpen((v) => !v)}>🎁 Gift</Button>
                  <Button variant="ghost" loading={saving} onClick={toggleWatchlist}>
                    {saved ? '✓ In your list' : '+ My list'}
                  </Button>
                </div>

                {giftOpen && (
                  <div className="mt-4 grid gap-3 rounded-glass border border-white/10 p-4">
                    <p className="text-sm text-[var(--text-secondary)]">
                      Buy this ticket for another CinneTemple member — they’ll be able to watch it once.
                    </p>
                    <TextField
                      label="Recipient email"
                      type="email"
                      value={giftEmail}
                      onChange={(e) => setGiftEmail(e.target.value)}
                      placeholder="friend@example.com"
                    />
                    <div className="flex gap-2">
                      <Button variant="primary" loading={buying} disabled={!giftEmail.trim()} onClick={() => buy(giftEmail.trim())}>
                        Send gift · {formatPrice(title.priceMinor, title.currency)}
                      </Button>
                      <Button variant="ghost" onClick={() => setGiftOpen(false)}>Cancel</Button>
                    </div>
                  </div>
                )}

                {title.isPremiere && (
                  <p className="mt-3 text-xs text-[var(--text-secondary)]">
                    Live chat opens when the premiere goes live. Your ticket grants a single viewing.
                  </p>
                )}
              </GlassPanel>

              <GlassPanel className="p-6">
                <dl className="space-y-3 text-sm">
                  {title.director && (
                    <div>
                      <dt className="text-[var(--text-secondary)]">Director</dt>
                      <dd>{title.director}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-[var(--text-secondary)]">Genres</dt>
                    <dd>{title.genres.join(', ')}</dd>
                  </div>
                  {title.cast.length > 0 && (
                    <div>
                      <dt className="text-[var(--text-secondary)]">Cast</dt>
                      <dd>{title.cast.join(', ')}</dd>
                    </div>
                  )}
                </dl>
              </GlassPanel>
            </div>
          </motion.div>
        )}
      </main>
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
