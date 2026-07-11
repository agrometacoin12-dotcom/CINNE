'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/** Client-side guard: redirects unauthenticated users to /login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // Preserve where the user was headed so login can return them there.
      const here =
        typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      const suffix = here && here !== '/' ? `?next=${encodeURIComponent(here)}` : '';
      router.replace(`/login${suffix}`);
    }
  }, [loading, user, router]);

  if (loading || !user) {
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
