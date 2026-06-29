'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/** Client-side guard: only admins may pass; others are redirected home. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const isAdmin = Boolean(user?.isAdmin || user?.roles?.includes('admin'));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!isAdmin) router.replace('/browse');
  }, [loading, user, isAdmin, router]);

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
