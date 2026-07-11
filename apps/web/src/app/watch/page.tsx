'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { PlaybackSession } from '@cinnetemple/shared';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { SecurePlayer } from '@/components/player/SecurePlayer';
import { RequireAuth } from '@/components/RequireAuth';
import { api, ApiError } from '@/lib/api';

function Watch() {
  const id = useSearchParams().get('id') ?? '';
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 'consumed' → 403: the single view was used (offer re-purchase).
  // 'novideo'  → 404: the title simply has no video yet (no purchase CTA).
  const [blocked, setBlocked] = useState<'consumed' | 'novideo' | null>(null);
  const [resumeSeconds, setResumeSeconds] = useState(0);

  useEffect(() => {
    if (!id) return;
    api
      .playbackStart(id)
      .then(setSession)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) {
          setBlocked('novideo');
          setError(e.message);
        } else if (e instanceof ApiError && e.status === 403) {
          setBlocked('consumed');
          setError(e.message);
        } else {
          setError(e instanceof ApiError ? e.message : 'Could not start playback');
        }
      });
  }, [id]);

  // Resume from the last saved position if the viewer has partial progress.
  useEffect(() => {
    if (!id) return;
    api
      .playbackContinue()
      .then((list) => {
        const match = list.find((c) => c.titleId === id);
        if (match?.positionSeconds) setResumeSeconds(match.positionSeconds);
      })
      .catch(() => undefined);
  }, [id]);

  return (
    <>
      {session ? (
        <div className="min-h-screen bg-black">
          <Link
            href="/browse"
            className="fixed left-5 top-5 z-50 grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white backdrop-blur lg-glass"
            aria-label="Back"
          >
            ✕
          </Link>
          <div className="mx-auto flex min-h-screen max-w-[1440px] items-center px-4">
            <SecurePlayer
              src={session.url}
              watermark={session.watermark}
              title={session.title}
              subtitle={
                session.durationSeconds
                  ? `${Math.floor(session.durationSeconds / 3600)}h ${Math.floor((session.durationSeconds % 3600) / 60)}m`
                  : undefined
              }
              expiresAt={session.expiresAt}
              titleId={id}
              resumeSeconds={resumeSeconds}
            />
          </div>
        </div>
      ) : (
        <>
          <GlassNav />
          <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
            {blocked === 'consumed' ? (
              <GlassPanel className="mx-auto mt-10 max-w-md p-8 text-center">
                <div className="mb-3 text-4xl">🎟️</div>
                <h1 className="text-xl font-semibold">You’ve used your single view</h1>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  This was a watch-once ticket. Buy it again to watch it another time.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Link href={`/title?id=${id}`}>
                    <Button variant="primary">Buy again to watch</Button>
                  </Link>
                  <Link href="/browse">
                    <Button variant="ghost">Browse</Button>
                  </Link>
                </div>
              </GlassPanel>
            ) : blocked === 'novideo' ? (
              <GlassPanel className="mx-auto mt-10 max-w-md p-8 text-center">
                <div className="mb-3 text-4xl">🎬</div>
                <h1 className="text-xl font-semibold">Not available yet</h1>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  This title doesn’t have a video to play yet. Check back soon.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <Link href={`/title?id=${id}`}>
                    <Button variant="ghost">Title details</Button>
                  </Link>
                  <Link href="/browse">
                    <Button variant="ghost">Browse</Button>
                  </Link>
                </div>
              </GlassPanel>
            ) : error ? (
              <GlassPanel className="mx-auto mt-10 max-w-md p-8 text-center">
                <p className="text-sm text-red-300">{error}</p>
                <div className="mt-4">
                  <Link href="/browse">
                    <Button variant="ghost">Back to browse</Button>
                  </Link>
                </div>
              </GlassPanel>
            ) : (
              <div className="flex min-h-[40vh] items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </div>
            )}
          </main>
        </>
      )}
    </>
  );
}

export default function WatchPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <Watch />
      </Suspense>
    </RequireAuth>
  );
}
