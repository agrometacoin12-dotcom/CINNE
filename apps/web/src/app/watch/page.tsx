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
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .playbackStart(id)
      .then(setSession)
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          setDenied(true);
          setError(e.message);
        } else {
          setError(e instanceof ApiError ? e.message : 'Could not start playback');
        }
      });
  }, [id]);

  return (
    <>
      <GlassNav />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6">
        {session ? (
          <>
            <h1 className="mb-3 text-2xl font-extrabold">{session.title}</h1>
            <SecurePlayer src={session.url} watermark={session.watermark} expiresAt={session.expiresAt} />
            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              This is a single-view ticket. Downloads, screenshots and screen recording are not
              permitted; your account is watermarked on the stream.
            </p>
          </>
        ) : denied ? (
          <GlassPanel className="mx-auto mt-10 max-w-md p-8 text-center">
            <div className="mb-3 text-4xl">🎟️</div>
            <h1 className="text-xl font-semibold">You don’t have a ticket for this yet</h1>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{error}</p>
            <div className="mt-5 flex justify-center gap-3">
              <Link href={`/title?id=${id}`}><Button variant="primary">Get a ticket</Button></Link>
              <Link href="/browse"><Button variant="ghost">Browse</Button></Link>
            </div>
          </GlassPanel>
        ) : error ? (
          <GlassPanel className="mx-auto mt-10 max-w-md p-8 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <div className="mt-4"><Link href="/browse"><Button variant="ghost">Back to browse</Button></Link></div>
          </GlassPanel>
        ) : (
          <div className="flex min-h-[40vh] items-center justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
      </main>
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
