'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { RequireAuth } from '@/components/RequireAuth';
import { formatPrice } from '@/lib/api';

/**
 * Mock checkout — the sandbox payment step. The commerce API returns an
 * authorizationUrl pointing here (…/payment/mock-checkout?reference&title&amount
 * &currency). We render a branded "Confirm your purchase" card; Confirm hands
 * off to the real callback (which verifies + grants the single-view ticket) and
 * Cancel returns the viewer to where they came from. This stands in for a hosted
 * PSP page — no charge happens until Confirm.
 */
function MockCheckout() {
  const params = useSearchParams();
  const router = useRouter();

  const reference = params.get('reference') ?? '';
  const title = params.get('title') ?? 'this title';
  const amount = params.get('amount');
  const currency = params.get('currency') ?? 'NGN';
  const price = amount != null && amount !== '' ? formatPrice(Number(amount), currency) : null;

  const confirm = () => {
    if (!reference) return;
    router.replace(`/payment/callback?reference=${encodeURIComponent(reference)}&mock=1`);
  };
  const cancel = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace('/browse');
  };

  return (
    <>
      <GlassNav />
      <main className="mx-auto flex max-w-lg flex-col items-center px-4 pt-24 text-center">
        <GlassPanel className="w-full p-8">
          {!reference ? (
            <>
              <h1 className="text-xl font-semibold">This checkout link is invalid</h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                The payment reference is missing. Please start the purchase again.
              </p>
              <div className="mt-5">
                <Button variant="ghost" onClick={() => router.replace('/browse')}>
                  Back to browse
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 text-4xl">🎟️</div>
              <h1 className="text-xl font-semibold">Confirm your purchase</h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                One-time payment — watch <span className="text-[var(--text-primary)]">{title}</span>{' '}
                once, then it’s yours to view. No subscription.
              </p>

              <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Single view · pay once
                  </p>
                </div>
                {price && <p className="text-lg font-bold text-[var(--text-primary)]">{price}</p>}
              </div>

              <div className="mt-6 flex justify-center gap-3">
                <Button variant="primary" onClick={confirm}>
                  {price ? `Pay ${price}` : 'Confirm purchase'}
                </Button>
                <Button variant="ghost" onClick={cancel}>
                  Cancel
                </Button>
              </div>
              <p className="mt-4 text-[11px] text-[var(--text-secondary)]">
                Sandbox checkout — no real card is charged.
              </p>
            </>
          )}
        </GlassPanel>
      </main>
    </>
  );
}

export default function MockCheckoutPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <MockCheckout />
      </Suspense>
    </RequireAuth>
  );
}
