'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { WatchlistItem } from '@cinnetemple/shared';
import { MobileShell } from '@/components/app/MobileShell';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

type RowIcon = 'bell' | 'download' | 'globe' | 'help';

function Glyph({ name }: { name: RowIcon }) {
  const c = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'bell': return <svg {...c}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.5 21a2 2 0 0 0 3 0" /></svg>;
    case 'download': return <svg {...c}><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>;
    case 'globe': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>;
    case 'help': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" /></svg>;
  }
}

const ROWS: { icon: RowIcon; label: string; href: string; external?: boolean }[] = [
  { icon: 'bell', label: 'Notifications', href: '/notifications' },
  { icon: 'download', label: 'Downloads', href: '/downloads' },
  { icon: 'globe', label: 'Language', href: '/settings' },
  { icon: 'help', label: 'Help & Support', href: 'mailto:support@cinnetemple.com', external: true },
];

/** Profile — exact Figma (node 42:13833): heading, avatar + name + email +
 *  Premium tag, grouped glass settings list, My List poster row, red Sign Out. */
function ProfileInner() {
  const { user, logout } = useAuth();
  const [list, setList] = useState<WatchlistItem[]>([]);

  useEffect(() => { api.watchlist().then(setList).catch(() => undefined); }, []);

  const name = user?.profile?.displayName ?? 'Your profile';
  const initials = (user?.profile?.displayName ?? user?.email ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const isPremium = Boolean(user?.isAdmin || user?.roles?.includes('premium') || user?.roles?.includes('admin'));

  return (
    <MobileShell showTopBar={false}>
      <div className="mx-auto max-w-2xl">
      <h1 className="font-readex text-[26px] font-bold text-white">Profile</h1>

      {/* Header */}
      <div className="mt-5 flex items-center gap-4">
        <span className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-full cine-grad text-lg font-bold text-white">{initials}</span>
        <div className="min-w-0">
          <p className="text-[18px] font-bold text-white">{name}</p>
          <p className="truncate text-[13px] text-white/55">{user?.email}</p>
          <p className="mt-0.5 text-[12px] font-semibold text-[#6c6ffc]">{isPremium ? 'Premium  •  renews Aug 2026' : 'Free plan'}</p>
        </div>
      </div>

      {/* Grouped settings list */}
      <div className="mt-6 overflow-hidden rounded-[16px] lg-glass">
        {ROWS.map((r, i) => {
          const inner = (
            <>
              <span className="text-white/80"><Glyph name={r.icon} /></span>
              <span className="flex-1 text-[15px] text-white">{r.label}</span>
              <span className="text-white/40">›</span>
            </>
          );
          const cls = `flex items-center gap-4 px-4 py-4 ${i > 0 ? 'border-t border-white/[0.08]' : ''}`;
          return r.external
            ? <a key={r.label} href={r.href} className={cls}>{inner}</a>
            : <Link key={r.label} href={r.href} className={cls}>{inner}</Link>;
        })}
      </div>

      {/* My List */}
      {list.length > 0 && (
        <section className="mt-7">
          <div className="flex items-center justify-between">
            <h2 className="font-readex text-[16px] font-semibold text-white">My List</h2>
            <Link href="/watchlist" className="text-[13px] font-bold text-[#6c6ffc]">See all</Link>
          </div>
          <div className="-mx-5 mt-3 flex gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {list.map((e) => e.title && (
              <Link key={e.titleId} href={`/title?id=${e.titleId}`} className="w-[110px] flex-shrink-0">
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[12px] border border-white/35" style={{ background: gradientCss(e.titleId) }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.title.posterUrl ?? `/art/posters/${e.titleId}.jpg`} alt={e.title.title} className="absolute inset-0 h-full w-full object-cover" onError={(ev) => (ev.currentTarget.style.display = 'none')} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Sign out */}
      <button onClick={() => void logout()} className="mt-7 flex h-[52px] w-full items-center justify-center rounded-[14px] text-[15px] font-semibold text-[#f2555a]" style={{ background: 'rgba(191,21,21,0.08)', border: '1px solid rgba(191,21,21,0.25)' }}>
        Sign Out
      </button>
      </div>
    </MobileShell>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileInner />
    </RequireAuth>
  );
}
