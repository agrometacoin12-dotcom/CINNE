'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

type IconName =
  | 'home'
  | 'fire'
  | 'rocket'
  | 'star'
  | 'video'
  | 'play'
  | 'grid'
  | 'gear'
  | 'help'
  | 'logout'
  | 'film';

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const c = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...c}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
        </svg>
      );
    case 'fire':
      return (
        <svg {...c}>
          <path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-1-3 3 2 4 5 4 8a8 8 0 1 1-16 0c0-4 3-6 4-8 1 2 3 2 4-3Z" />
        </svg>
      );
    case 'rocket':
      return (
        <svg {...c}>
          <path d="M5 15c-1 1-2 4-2 4s3-1 4-2m10-13c2 0 3 1 3 3 0 5-4 9-8 11l-3-3C11 11 15 7 20 7Z" />
          <circle cx="14.5" cy="9.5" r="1.5" />
        </svg>
      );
    case 'star':
      return (
        <svg {...c}>
          <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8Z" />
        </svg>
      );
    case 'video':
      return (
        <svg {...c}>
          <rect x="2.5" y="6.5" width="13" height="11" rx="2.5" />
          <path d="m16 10 5-2.5v9L16 14" />
        </svg>
      );
    case 'play':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <path d="m10 9 5 3-5 3V9Z" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...c}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2l-.4-2.6h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2Z" />
        </svg>
      );
    case 'help':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...c}>
          <path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M4 12h11" />
        </svg>
      );
    case 'film':
      return (
        <svg {...c}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
        </svg>
      );
  }
}

const NAV: { label: string; href: string; icon: IconName }[] = [
  { label: 'Home', href: '/browse', icon: 'home' },
  { label: 'Trending', href: '/browse#trending', icon: 'fire' },
  { label: 'New Release', href: '/browse#new-releases', icon: 'rocket' },
  { label: 'Popular', href: '/browse#most-watched', icon: 'star' },
  { label: 'Watchlist', href: '/watchlist', icon: 'video' },
  // Continue Watching lives on Home (real progress row from /playback/continue).
  { label: 'Continue Watching', href: '/browse#continue', icon: 'play' },
];

// Figma 42:12592 — Home · Movies · TV Shows · Categories · My List
const TABS = [
  { label: 'Home', href: '/browse' },
  { label: 'Movies', href: '/categories' },
  { label: 'TV Shows', href: '/premieres' },
  { label: 'Categories', href: '/categories' },
  { label: 'My List', href: '/watchlist' },
];

/* eslint-disable @next/next/no-img-element */
/**
 * Desktop app shell — exact Figma Home frame 42:12534: 274px sidebar
 * (#0a0d14, border #121724) with C-logo + Baloo wordmark, glass nav pills,
 * a pay-once/watch-once note (no subscription tiers), Settings / Help & Support
 * / Log out; top bar with glass tab group, search pill (242×46), bell, 46px
 * avatar + chevron.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isAdmin = Boolean(user?.isAdmin || user?.roles?.includes('admin'));
  const active = (href: string) => pathname === href || (href === '/browse' && pathname === '/');

  const navBtn = (label: string, href: string, icon: IconName) => {
    const isActive = active(href);
    return (
      <Link
        key={href + label}
        href={href}
        className={`flex h-[46px] items-center gap-2 rounded-[14px] px-[18px] transition ${isActive ? 'lg-nav-active text-[20px] font-medium text-white' : 'text-[15px] text-white hover:bg-white/[0.03]'}`}
      >
        <Icon name={icon} size={isActive ? 24 : 20} />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[#090b12] text-white">
      {/* Sidebar — 42:12739 */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[274px] flex-col overflow-y-auto border-r border-[#121724] bg-[#0a0d14] px-4 py-5 lg:flex">
        <Link href="/browse" className="mb-6 flex items-center gap-2.5">
          <img src="/art/figma/c-logo.png" alt="" className="h-[41px] w-[41px] object-contain" />
          <span className="font-logo text-[30px] font-bold leading-none text-white">
            Cinnetemple
          </span>
        </Link>

        <nav className="flex flex-col gap-2">{NAV.map((n) => navBtn(n.label, n.href, n.icon))}</nav>

        {/* Pay-once / watch-once model note — no subscription tiers. */}
        <div className="mt-6 rounded-xl border border-[#121724] px-5 py-7 text-center">
          <svg
            className="mx-auto"
            width="56"
            height="56"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6c6ffc"
            strokeWidth="1.4"
            strokeLinejoin="round"
          >
            <rect x="3" y="6" width="18" height="12" rx="2.5" />
            <path d="M3 10h18M7 15h4" />
          </svg>
          <p className="mt-3.5 font-readex text-lg font-semibold text-white">
            Pay once, watch once
          </p>
          <p className="mt-2 text-[15px] leading-snug text-white/80">
            No subscription — buy a ticket and stream the title a single time.
          </p>
          <Link
            href="/browse"
            className="mt-4 flex h-[46px] w-full items-center justify-center rounded-md text-[15px] font-semibold text-white"
            style={{ background: 'rgba(99,102,241,0.2)' }}
          >
            Browse titles
          </Link>
        </div>

        {/* Bottom — Settings · Help & Support · Log out (42:12764…12794) */}
        <div className="mt-auto flex flex-col gap-2 pt-6">
          {isAdmin && navBtn('Studio', '/admin', 'film')}
          {navBtn('Settings', '/settings', 'gear')}
          <a
            href="mailto:support@cinnetemple.com"
            className="flex h-[46px] items-center gap-2 rounded-[14px] px-[18px] text-[15px] text-white transition hover:bg-white/[0.03]"
          >
            <Icon name="help" /> Help &amp; Support
          </a>
          <button
            onClick={() => void logout()}
            className="lg-glass flex h-[46px] items-center gap-2 rounded-[14px] px-[18px] text-[15px] text-[#971e00]"
            style={{ background: 'rgba(191,21,21,0.05)' }}
          >
            <Icon name="logout" /> Log out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-[274px]">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 bg-[#090b12]/90 px-4 py-4 backdrop-blur-xl sm:px-8 lg:pl-[43px] lg:pr-[35px]">
          {/* Glass tab group — 545×46 rounded-12 (42:12592) */}
          <div className="hidden h-[46px] items-center rounded-[12px] lg-glass md:flex">
            {TABS.map((t, i) => {
              const isActive = active(t.href) && TABS.findIndex((x) => active(x.href)) === i;
              return (
                <Link
                  key={t.href + t.label}
                  href={t.href}
                  className={`flex h-full items-center rounded-[14px] px-5 transition ${isActive ? 'lg-nav-active text-[15px] font-semibold text-white' : 'text-[13.6px] font-normal text-white/40 hover:text-white/70'}`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
          <div className="flex flex-1 items-center justify-end gap-4">
            {/* Search pill — 242×46 (42:12605) */}
            <Link
              href="/search"
              className="flex h-[46px] items-center gap-2 rounded-[12px] px-4 text-[13.6px] text-white/60 lg-glass opacity-40 transition hover:opacity-70 sm:w-[242px]"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3-3" />
              </svg>
              <span className="hidden truncate sm:inline">Search for movies, shows....</span>
            </Link>
            {user && (
              <Link
                href="/notifications"
                aria-label="Notifications"
                className="grid h-6 w-6 place-items-center text-white"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.6"
                >
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
                  <path d="M10.5 21a2 2 0 0 0 3 0" />
                </svg>
              </Link>
            )}
            {user ? (
              <Link href="/profile" className="flex items-center gap-1">
                <span
                  className="grid h-[46px] w-[46px] place-items-center overflow-hidden rounded-full"
                  style={{ background: 'rgba(99,102,241,0.2)' }}
                >
                  <img src="/art/figma/avatar.svg" alt="" className="mt-3 h-[54px] w-[34px]" />
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </Link>
            ) : (
              <Link
                href="/login"
                className="grid h-10 w-[110px] place-items-center rounded-[11px] lg-glass-indigo text-[13.5px] font-semibold text-white"
              >
                Sign In
              </Link>
            )}
          </div>
        </header>
        <main className="px-4 pb-24 sm:px-6 md:pb-12 lg:pl-[43px] lg:pr-[35px]">{children}</main>
      </div>

      {/* Mobile bottom tab pill (small screens only) */}
      <div className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-24px)] max-w-[402px] -translate-x-1/2 items-center justify-between rounded-[12px] lg-glass p-1 md:hidden">
        {[
          { label: 'Home', href: '/browse' },
          { label: 'Movies', href: '/categories' },
          { label: 'TV Shows', href: '/premieres' },
          { label: 'My List', href: '/watchlist' },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`flex-1 rounded-[13px] py-2.5 text-center text-[13px] transition ${active(t.href) ? 'font-semibold text-white lg-nav-active' : 'font-normal text-white/40'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
