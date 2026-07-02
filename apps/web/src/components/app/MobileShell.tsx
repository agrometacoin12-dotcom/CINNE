'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/**
 * Mobile app frame — exact Figma: a centered ≤430px column on canvas #09090b with
 * a glass search/bell/avatar top bar and a floating liquid-glass bottom tab pill
 * (Home / Movies / TV Shows / My List). Mirrors the iPhone design responsively.
 */
const TABS = [
  { label: 'Home', href: '/browse' },
  { label: 'Movies', href: '/categories' },
  { label: 'TV Shows', href: '/categories?type=series' },
  { label: 'My List', href: '/watchlist' },
];

export function MobileShell({ children, showTopBar = true }: { children: React.ReactNode; showTopBar?: boolean }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const active = (href: string) => pathname === href.split('?')[0] || (href === '/browse' && pathname === '/');
  const initials = (user?.profile?.displayName ?? user?.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <div className="flex min-h-screen justify-center bg-[#09090b] text-white">
      <div className="relative w-full max-w-[430px] px-5 pb-28 pt-14">
        {showTopBar && (
          <div className="mb-6 flex items-center gap-3">
            <Link href="/search" className="lg-glass flex h-11 flex-1 items-center gap-2 rounded-[11.5px] px-4 text-[13px] text-white/60">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
              Search for movies, shows....
            </Link>
            <Link href="/notifications" aria-label="Notifications" className="text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.5 21a2 2 0 0 0 3 0" /></svg>
            </Link>
            <Link href="/profile" className="flex items-center gap-1">
              <span className="grid h-11 w-11 place-items-center rounded-full text-sm font-semibold text-white" style={{ background: 'rgba(99,102,241,0.2)' }}>{initials}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/70"><path d="m6 9 6 6 6-6" /></svg>
            </Link>
          </div>
        )}

        {children}

        {/* Floating bottom tab pill */}
        <div className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-28px)] max-w-[402px] -translate-x-1/2 items-center justify-between rounded-[12px] lg-glass p-1">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 rounded-[13px] py-2.5 text-center text-[14px] transition ${active(t.href) ? 'font-semibold text-white lg-nav-active' : 'font-normal text-white/40'}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
