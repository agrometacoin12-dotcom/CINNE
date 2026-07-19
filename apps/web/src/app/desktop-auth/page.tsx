'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';

/**
 * Desktop-link authorization: CinneTemple Studio (the desktop app) opens this
 * page with ?port=NNNN&challenge=... — the signed-in user approves, we mint a
 * single-use code and hand it back to the app's loopback listener. The
 * redirect host is HARD-CODED to 127.0.0.1; only the validated port is
 * interpolated. The challenge/code are never logged or displayed.
 */

const CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;

function parsePort(raw: string | null): number | null {
  if (!raw || !/^\d{4,5}$/.test(raw)) return null;
  const port = Number(raw);
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null;
}

type Phase = 'ready' | 'approving' | 'approved' | 'cancelled' | 'error';

function DesktopAuthInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useAuth();

  const port = useMemo(() => parsePort(params.get('port')), [params]);
  const challenge = useMemo(() => {
    const raw = params.get('challenge');
    return raw && CHALLENGE_RE.test(raw) ? raw : null;
  }, [params]);
  const valid = port !== null && challenge !== null;

  const [phase, setPhase] = useState<Phase>('ready');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Preserve where the user was headed so login can return them here.
  useEffect(() => {
    if (!loading && !user && valid) {
      const here = window.location.pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [loading, user, valid, router]);

  if (!valid) {
    return (
      <AuthShell title="Desktop authorization" subtitle="This authorization link is invalid">
        <div className="space-y-4 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            The link that opened this page is missing or malformed. Please return to CinneTemple
            Studio on your computer and start the sign-in again.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (loading || !user) {
    return (
      <AuthShell title="Desktop authorization" subtitle="Checking your session…">
        <div className="flex justify-center py-6">
          <span
            aria-label="Loading"
            className="h-8 w-8 animate-spin rounded-full border-2 border-black/20 border-t-black/60"
          />
        </div>
      </AuthShell>
    );
  }

  const approve = async () => {
    setPhase('approving');
    setErrorMessage(null);
    try {
      const { code } = await api.createDesktopAuthCode({ challenge });
      setPhase('approved');
      window.location.href = `http://127.0.0.1:${port}/callback?code=${encodeURIComponent(code)}`;
    } catch (err) {
      setPhase('error');
      setErrorMessage(
        err instanceof ApiError && err.status !== 500
          ? err.message
          : 'Something went wrong while authorizing. Please try again.',
      );
    }
  };

  if (phase === 'approved') {
    return (
      <AuthShell title="Desktop authorization" subtitle="Authorization complete">
        <div className="space-y-4 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            You can now return to CinneTemple Studio on your computer — it should finish signing you
            in automatically. It is safe to close this tab.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (phase === 'cancelled') {
    return (
      <AuthShell title="Desktop authorization" subtitle="Authorization cancelled">
        <div className="space-y-4 text-center">
          <p className="text-sm text-[var(--text-secondary)]">
            No code was issued and this computer was not authorized. You can close this tab, or
            approve below if you changed your mind.
          </p>
          <Button fullWidth variant="glass" onClick={() => setPhase('ready')}>
            Back
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Desktop authorization"
      subtitle="Authorize CinneTemple Studio on this computer?"
    >
      <div className="space-y-5">
        {phase === 'error' && errorMessage && (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        <p className="text-center text-sm text-[var(--text-secondary)]">
          CinneTemple Studio running on this computer is asking to sign in as
        </p>
        <p className="text-center text-sm font-semibold" style={{ color: '#16161a' }}>
          {user.email}
        </p>
        <p className="text-center text-xs text-[var(--text-secondary)]">
          Approving issues a one-time code to the app on this machine. Only approve if you started
          this from CinneTemple Studio yourself.
        </p>

        <div className="space-y-3">
          <Button fullWidth loading={phase === 'approving'} onClick={approve}>
            {phase === 'error' ? 'Try again' : 'Approve'}
          </Button>
          <Button
            fullWidth
            variant="glass"
            disabled={phase === 'approving'}
            onClick={() => setPhase('cancelled')}
          >
            Cancel
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}

export default function DesktopAuthPage() {
  return (
    <Suspense fallback={null}>
      <DesktopAuthInner />
    </Suspense>
  );
}
