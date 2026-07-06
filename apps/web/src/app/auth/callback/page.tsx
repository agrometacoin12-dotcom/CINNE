'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Alert } from '@/components/ui/Alert';
import { tokenStore } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * OAuth return target. The backend (`/v1/auth/google/callback`) issues our token
 * pair and redirects here with the tokens in the URL fragment
 * (#accessToken=…&refreshToken=…). We store them and enter the app. Errors come
 * back as `?error=…`, which we surface before bouncing to /login.
 */
function CallbackInner() {
  const params = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = params.get('error');
    if (err) {
      setError(err);
      const t = setTimeout(() => router.replace('/login?error=' + encodeURIComponent(err)), 1200);
      return () => clearTimeout(t);
    }

    const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
    const frag = new URLSearchParams(hash);
    const accessToken = frag.get('accessToken');
    const refreshToken = frag.get('refreshToken');
    if (!accessToken || !refreshToken) {
      setError('Missing sign-in tokens.');
      const t = setTimeout(() => router.replace('/login'), 1500);
      return () => clearTimeout(t);
    }

    // Persist the session, wipe the tokens from the URL, then enter the app.
    tokenStore.set({
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: Number(frag.get('expiresIn') ?? 900),
    });
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    refreshUser()
      .then(() => router.replace('/browse'))
      .catch(() => {
        setError('Could not finish sign-in.');
        setTimeout(() => router.replace('/login'), 1500);
      });
  }, [params, router, refreshUser]);

  return (
    <AuthShell title="Finishing sign-in" subtitle="One moment…">
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : (
        <div className="flex items-center justify-center py-6">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}
    </AuthShell>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
