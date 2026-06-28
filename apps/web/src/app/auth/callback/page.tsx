'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { Alert } from '@/components/ui/Alert';

/**
 * OAuth (Apple/Google via Cognito Hosted UI) redirect target. The Hosted UI
 * returns an authorization `code`; the backend exchanges it for tokens at
 * /v1/auth/oauth/:provider (wired alongside the social-login backend work).
 */
function CallbackInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = params.get('error');
    const code = params.get('code');
    if (err) {
      setError(err);
      return;
    }
    if (!code) {
      setError('Missing authorization code.');
      return;
    }
    // Backend code-exchange endpoint lands with the social-login increment.
    const t = setTimeout(() => router.replace('/login'), 1500);
    return () => clearTimeout(t);
  }, [params, router]);

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
