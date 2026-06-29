'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import type { Title } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';

function TitleDetail() {
  const id = useSearchParams().get('id') ?? '';
  const { user } = useAuth();
  const [title, setTitle] = useState<Title | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .title(id)
      .then(setTitle)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load title'));
  }, [id]);

  const toggleWatchlist = async () => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
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

  return (
    <>
      <GlassNav />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6">
        {error && <Alert tone="error">{error}</Alert>}
        {title && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
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
                <h1 className="text-4xl font-extrabold">{title.title}</h1>
                {title.tagline && (
                  <p className="mt-1 text-[var(--text-secondary)]">{title.tagline}</p>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-[2fr_1fr]">
              <GlassPanel className="p-6">
                <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
                  <span className="capitalize">{title.type}</span>
                  <span>{title.year}</span>
                  <span>★ {title.rating.toFixed(1)}</span>
                  {title.maturityRating && (
                    <span className="glass rounded px-2 py-0.5 text-xs">{title.maturityRating}</span>
                  )}
                  {title.runtimeMinutes && <span>{title.runtimeMinutes} min</span>}
                  {title.seasons && <span>{title.seasons} season{title.seasons > 1 ? 's' : ''}</span>}
                </div>
                <p className="mt-4 leading-relaxed">{title.overview}</p>
                <div className="mt-5 flex gap-3">
                  <Button variant="primary">▶ Play</Button>
                  <Button variant="glass" loading={saving} onClick={toggleWatchlist}>
                    {saved ? '✓ In your list' : '+ My list'}
                  </Button>
                </div>
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
