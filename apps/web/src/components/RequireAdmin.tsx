'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/**
 * Client-side guard: only admins may pass. Non-admins see a brief
 * "Admin access required" message before being redirected to /browse; users
 * who aren't signed in go to /login.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [denied, setDenied] = useState(false);

  const isAdmin = Boolean(user?.isAdmin || user?.roles?.includes('admin'));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (!isAdmin) {
      // Show the message briefly, then bounce.
      setDenied(true);
      const t = setTimeout(() => router.replace('/browse'), 1400);
      return () => clearTimeout(t);
    }
  }, [loading, user, isAdmin, router]);

  if (denied || (!loading && user && !isAdmin)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <span
          className="grid h-12 w-12 place-items-center rounded-full text-2xl"
          style={{ background: 'rgba(239,68,68,0.16)' }}
        >
          🔒
        </span>
        <p className="font-readex text-lg font-semibold text-white">Admin access required</p>
        <p className="max-w-sm text-sm text-white/55">
          Your account doesn’t have Studio permissions. Taking you back to browse…
        </p>
      </div>
    );
  }

  if (loading || !user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span
          aria-label="Loading"
          className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white"
        />
      </div>
    );
  }
  return <>{children}</>;
}
