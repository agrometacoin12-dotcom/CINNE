'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

type IconName = 'home' | 'fire' | 'rocket' | 'star' | 'video' | 'play' | 'grid' | 'gear' | 'help' | 'logout' | 'film';

function Icon({ name }: { name: IconName }) {
  const c = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'home': return <svg {...c}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
    case 'fire': return <svg {...c}><path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-1-3 3 2 4 5 4 8a8 8 0 1 1-16 0c0-4 3-6 4-8 1 2 3 2 4-3Z" /></svg>;
    case 'rocket': return <svg {...c}><path d="M5 15c-1 1-2 4-2 4s3-1 4-2m10-13c2 0 3 1 3 3 0 5-4 9-8 11l-3-3C11 11 15 7 20 7Z" /><circle cx="14.5" cy="9.5" r="1.5" /></svg>;
    case 'star': return <svg {...c}><path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8Z" /></svg>;
    case 'video': return <svg {...c}><rect x="2.5" y="6.5" width="13" height="11" rx="2.5" /><path d="m16 10 5-2.5v9L16 14" /></svg>;
    case 'play': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M10 9v6" /></svg>;
    case 'grid': return <svg {...c}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case 'gear': return <svg {...c}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2l-.4-2.6h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2Z" /></svg>;
    case 'help': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" /></svg>;
    case 'logout': return <svg {...c}><path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M4 12h11" /></svg>;
    case 'film': return <svg {...c}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></svg>;
  }
}

const NAV: { label: string; href: string; icon: IconName }[] = [
  { label: 'Home', href: '/browse', icon: 'home' },
  { label: 'Trending', href: '/browse#trending', icon: 'fire' },
  { label: 'New Release', href: '/browse#new-releases', icon: 'rocket' },
  { label: 'Popular', href: '/browse#most-watched', icon: 'star' },
  { label: 'Watchlist', href: '/watchlist', icon: 'video' },
  { label: 'Continue Watching', href: '/tickets', icon: 'play' },
];

const TABS = [
  { label: 'Home', href: '/browse' },
  { label: 'Premieres', href: '/premieres' },
  { label: 'Categories', href: '/categories' },
  { label: 'My List', href: '/watchlist' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isAdmin = Boolean(user?.isAdmin || user?.roles?.includes('admin'));
  const active = (href: string) => pathname === href || (href === '/browse' && pathname === '/');

  const navBtn = (label: string, href: string, icon: IconName) => (
    <Link key={href + label} href={href} className={`flex h-[46px] items-center gap-3 rounded-[14px] px-4 text-[15px] transition ${active(href) ? 'lg-nav-active font-semibold text-white' : 'text-white/90 hover:bg-white/[0.03]'}`}>
      <Icon name={icon} />
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#090b12] text-white">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[274px] flex-col overflow-y-auto border-r border-[#121724] bg-[#0a0d14] px-4 py-6 lg:flex">
        <Link href="/browse" className="mb-7 flex items-center gap-2.5 px-1">
          <span className="grid h-10 w-10 place-items-center rounded-xl cine-grad text-lg font-bold">C</span>
          <span className="font-readex text-lg font-semibold tracking-tight">cinne<span className="text-[#8082ff]">temple</span></span>
        </Link>

        <nav className="flex flex-col gap-2">{NAV.map((n) => navBtn(n.label, n.href, n.icon))}</nav>

        {/* Go Premium */}
        <div className="mt-5 rounded-xl border border-[#121724] p-4 text-center">
          <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl" style={{ background: '#8082ff', boxShadow: 'inset 4px -4px 5px rgba(96,98,219,0.25), inset -3px 4px 7px #6062db' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8Z" /></svg>
          </span>
          <p className="font-[Manrope] text-lg font-semibold text-white">Go Premium</p>
          <p className="mt-2 text-[15px] leading-tight text-white/85">Watch ad-free and get exclusive content.</p>
          <Link href="/premieres" className="mt-4 block rounded-md py-2.5 text-[15px] font-semibold text-white" style={{ background: 'rgba(99,102,241,0.2)' }}>Upgrade now</Link>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-6">
          {isAdmin && navBtn('Studio', '/admin', 'film')}
          <a href="mailto:support@cinnetemple.com" className="flex h-[46px] items-center gap-3 rounded-[14px] px-4 text-[15px] text-white/90 transition hover:bg-white/[0.03]"><Icon name="help" /> Help &amp; Support</a>
          {navBtn('Settings', '/settings', 'gear')}
          <button onClick={() => void logout()} className="flex h-[46px] items-center gap-3 rounded-[14px] px-4 text-[15px] text-[#c0392b] transition hover:bg-[rgba(191,21,21,0.06)]" style={{ background: 'rgba(191,21,21,0.05)' }}><Icon name="logout" /> Log out</button>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-[274px]">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 bg-[#090b12]/90 px-4 py-4 backdrop-blur-xl sm:px-8">
          {/* pill tabs */}
          <div className="hidden items-center gap-1 rounded-xl p-1 lg-glass md:flex">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className={`rounded-[13px] px-5 py-2 text-sm transition ${active(t.href) ? 'font-semibold text-white lg-nav-active' : 'font-normal text-white/50 hover:text-white/80'}`}>
                {t.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-1 items-center justify-end gap-3">
            <Link href="/search" className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white/60 lg-glass sm:min-w-[240px]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3-3" /></svg>
              <span className="hidden sm:inline">Search for movies, shows…</span>
            </Link>
            {user && (
              <Link href="/tickets" aria-label="Notifications" className="grid h-[46px] w-[46px] place-items-center rounded-full" style={{ background: 'rgba(99,102,241,0.2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.5 21a2 2 0 0 0 3 0" /></svg>
              </Link>
            )}
            {user ? (
              <Link href="/profile" className="grid h-10 w-10 place-items-center rounded-full cine-grad text-sm font-semibold text-white">
                {(user.profile?.displayName ?? user.email).slice(0, 1).toUpperCase()}
              </Link>
            ) : (
              <Link href="/login" className="rounded-full cine-grad px-5 py-2 text-sm font-semibold text-white">Sign in</Link>
            )}
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
