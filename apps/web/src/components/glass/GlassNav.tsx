'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { NotificationBell } from '@/components/NotificationBell';

const TABS = [
  { label: 'Home', href: '/browse' },
  { label: 'Premieres', href: '/premieres' },
  { label: 'Categories', href: '/search' },
  { label: 'Tickets', href: '/tickets' },
  { label: 'My List', href: '/watchlist' },
];

/**
 * Figma pill navigation: a glass pill of tabs (active = violet gradient) on the
 * left, and a search pill + bell + avatar on the right. Transparent over the
 * hero, solid on scroll.
 */
export function GlassNav({ transparentUntilScroll = false }: { transparentUntilScroll?: boolean }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const isAdmin = Boolean(user?.isAdmin || user?.roles?.includes('admin'));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const solid = !transparentUntilScroll || scrolled;

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${solid ? 'bg-[#0a0a0f]/85 backdrop-blur-xl' : 'bg-gradient-to-b from-black/70 to-transparent'}`}
      >
        <nav className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          {/* Left: brand + pill tabs */}
          <div className="flex items-center gap-4">
            <Link href={user ? '/browse' : '/'} className="flex items-center gap-2 pr-1">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#6c6ffc] to-[#4f46e5]">
                <svg viewBox="0 0 256 256" className="h-4 w-4" aria-hidden="true">
                  <path fill="#fff" d="M 128 192 L 128 256 L 64.5 256 L 32 223 L 0 192 L 0 128 L 64 128 Z M 256 192 L 256 256 L 192.5 256 L 160 223 L 128 192 L 128 128 L 192 128 Z M 128 64 L 128 128 L 64.5 128 L 32 95 L 0 64 L 0 0 L 64 0 Z M 256 64 L 256 128 L 192.5 128 L 160 95 L 128 64 L 128 0 L 192 0 Z" />
                </svg>
              </span>
              <span className="hidden font-readex text-[15px] font-medium text-white sm:block">cinnetemple</span>
            </Link>

            <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur md:flex">
              {TABS.map((t) => {
                const active = pathname === t.href || (t.href === '/browse' && pathname === '/');
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-gradient-to-br from-[#6c6ffc] to-[#4f46e5] text-white shadow-md shadow-[#4f46e5]/30' : 'text-white/60 hover:text-white'}`}
                  >
                    {t.label}
                  </Link>
                );
              })}
              {isAdmin && (
                <Link href="/admin" className="rounded-full px-4 py-1.5 text-sm font-medium text-[#8082ff] hover:text-white">
                  Studio
                </Link>
              )}
            </div>
          </div>

          {/* Right: search + bell + avatar */}
          <div className="flex items-center gap-2.5">
            <Link
              href="/search"
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/45 transition hover:text-white/70"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
              <span className="hidden lg:inline">Search for movies, shows…</span>
            </Link>
            {user && <NotificationBell />}
            {user ? (
              <button onClick={() => void logout()} title="Sign out" className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#6c6ffc] to-[#4f46e5] text-sm font-semibold text-white">
                {(user.profile?.displayName ?? user.email).slice(0, 1).toUpperCase()}
              </button>
            ) : (
              <Link href="/login" className="rounded-full bg-gradient-to-br from-[#6c6ffc] to-[#4f46e5] px-5 py-2 text-sm font-semibold text-white">
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </header>
      {!transparentUntilScroll && <div aria-hidden className="h-[64px]" />}
    </>
  );
}
