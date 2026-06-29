'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/Button';

/** Translucent top navigation bar (Liquid Glass). */
export function GlassNav() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 px-4 pt-4">
      <nav className="nav-glass mx-auto flex max-w-6xl items-center justify-between rounded-glass px-5 py-3">
        <div className="flex items-center gap-5">
          <Link href="/" className="text-lg font-extrabold tracking-tight">
            <span className="text-gradient">CinneTemple</span>
          </Link>
          <div className="hidden items-center gap-4 text-sm text-[var(--text-secondary)] sm:flex">
            <Link href="/browse" className="hover:text-[var(--text-primary)]">Browse</Link>
            <Link href="/premieres" className="hover:text-[var(--text-primary)]">Premieres</Link>
            <Link href="/search" className="hover:text-[var(--text-primary)]">Search</Link>
            {user && (
              <>
                <Link href="/watchlist" className="hover:text-[var(--text-primary)]">My list</Link>
                <Link href="/tickets" className="hover:text-[var(--text-primary)]">Tickets</Link>
              </>
            )}
            {(user?.isAdmin || user?.roles?.includes('admin')) && (
              <Link href="/admin" className="font-medium text-[var(--text-primary)]">Studio</Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user && <NotificationBell />}
          <ThemeToggle />
          {user ? (
            <>
              <Link href="/profile">
                <Button variant="ghost">Profile</Button>
              </Link>
              <Button variant="glass" onClick={() => void logout()}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link href="/register">
                <Button variant="primary">Get started</Button>
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
