'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { RequireAuth } from '@/components/RequireAuth';
import { api } from '@/lib/api';

function Callback() {
  const reference = useSearchParams().get('reference') ?? '';
  const router = useRouter();
  const [state, setState] = useState<'verifying' | 'paid' | 'pending' | 'failed'>('verifying');
  const [titleId, setTitleId] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setState('failed');
      return;
    }
    let tries = 0;
    let cancelled = false;
    const check = async () => {
      try {
        const r = await api.verifyPurchase(reference);
        if (cancelled) return;
        setTitleId(r.titleId);
        if (r.status === 'paid') {
          setState('paid');
          setTimeout(() => router.replace(`/watch?id=${r.titleId}`), 1200);
        } else if (r.status === 'failed') {
          setState('failed');
        } else if (tries < 5) {
          tries += 1;
          setTimeout(check, 2000); // poll while the PSP settles
        } else {
          setState('pending');
        }
      } catch {
        if (!cancelled) setState('failed');
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [reference, router]);

  return (
    <>
      <GlassNav />
      <main className="mx-auto flex max-w-lg flex-col items-center px-4 pt-24 text-center">
        <GlassPanel className="w-full p-8">
          {state === 'verifying' && (
            <>
              <span className="mx-auto mb-4 block h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              <h1 className="text-xl font-semibold">Confirming your payment…</h1>
            </>
          )}
          {state === 'paid' && (
            <>
              <div className="mb-3 text-4xl">🎬</div>
              <h1 className="text-xl font-semibold">You’re in. Enjoy the show.</h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Taking you to the player…</p>
            </>
          )}
          {state === 'pending' && (
            <>
              <h1 className="text-xl font-semibold">Payment is still processing</h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                We’ll unlock the title as soon as it settles. Check your tickets shortly.
              </p>
              <div className="mt-5">
                <Link href="/tickets"><Button variant="glass">My tickets</Button></Link>
              </div>
            </>
          )}
          {state === 'failed' && (
            <>
              <h1 className="text-xl font-semibold">We couldn’t confirm that payment</h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">No charge has been applied, or it was cancelled.</p>
              <div className="mt-5 flex justify-center gap-3">
                {titleId && (
                  <Link href={`/title?id=${titleId}`}><Button variant="primary">Try again</Button></Link>
                )}
                <Link href="/browse"><Button variant="ghost">Browse</Button></Link>
              </div>
            </>
          )}
        </GlassPanel>
      </main>
    </>
  );
}

export default function PaymentCallbackPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <Callback />
      </Suspense>
    </RequireAuth>
  );
}
