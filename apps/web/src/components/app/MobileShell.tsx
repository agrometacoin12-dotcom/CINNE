'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/**
 * App shell — desktop-first, responsive. On desktop: a full-width glass top nav
 * (logo, tabs, search, notifications, avatar) over a centered ≤1400px content
 * area. On mobile it collapses and shows the floating liquid-glass bottom tab
 * pill. Same indigo + glass language as the Figma.
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
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Top nav */}
      <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 rounded-2xl lg-glass px-4 sm:px-6">
          <Link href="/browse" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg cine-grad"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7L8 5Z" /></svg></span>
            <span className="hidden font-logo text-xl font-bold sm:block">Cinnetemple</span>
          </Link>

          <div className="ml-6 hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className={`rounded-[12px] px-4 py-2 text-sm transition ${active(t.href) ? 'font-semibold text-white lg-nav-active' : 'font-normal text-white/60 hover:text-white'}`}>
                {t.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            {showTopBar && (
              <Link href="/search" className="hidden items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white/55 lg-glass sm:flex sm:min-w-[220px]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
                <span className="hidden lg:inline">Search for movies, shows…</span>
              </Link>
            )}
            <Link href="/notifications" aria-label="Notifications" className="grid h-11 w-11 place-items-center rounded-full text-white" style={{ background: 'rgba(99,102,241,0.2)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.5 21a2 2 0 0 0 3 0" /></svg>
            </Link>
            <Link href="/profile" className="grid h-11 w-11 place-items-center rounded-full cine-grad text-sm font-semibold text-white">{initials}</Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 md:pb-12">{children}</main>

      {/* Mobile bottom tab pill (small screens only) */}
      <div className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-24px)] max-w-[402px] -translate-x-1/2 items-center justify-between rounded-[12px] lg-glass p-1 md:hidden">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={`flex-1 rounded-[13px] py-2.5 text-center text-[13px] transition ${active(t.href) ? 'font-semibold text-white lg-nav-active' : 'font-normal text-white/40'}`}>{t.label}</Link>
        ))}
      </div>
    </div>
  );
}
