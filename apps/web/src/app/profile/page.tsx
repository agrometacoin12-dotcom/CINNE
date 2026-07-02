'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { WatchlistItem } from '@cinnetemple/shared';
import { MobileShell } from '@/components/app/MobileShell';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { gradientCss } from '@/lib/poster';

type RowIcon = 'bell' | 'download' | 'globe' | 'help';

function Glyph({ name }: { name: RowIcon }) {
  const c = {
    width: 20,
    height: 20,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'bell':
      return (
        <svg {...c}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10.5 21a2 2 0 0 0 3 0" />
        </svg>
      );
    case 'download':
      return (
        <svg {...c}>
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      );
    case 'globe':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
        </svg>
      );
    case 'help':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" />
        </svg>
      );
  }
}

const ROWS: { icon: RowIcon; label: string; href: string }[] = [
  { icon: 'bell', label: 'Notifications', href: '/notifications' },
  { icon: 'download', label: 'Downloads', href: '/downloads' },
  { icon: 'globe', label: 'Language', href: '/settings' },
  { icon: 'help', label: 'Help & Support', href: 'mailto:support@cinnetemple.com' },
];

/* eslint-disable @next/next/no-img-element */
/**
 * Profile — exact Figma frame 42:14382: "Profile" heading (Manrope Bold 28),
 * Account Card (520×264, glass 0.08, 88px indigo initials avatar, name, email,
 * plan line, Edit Profile + Manage Plan buttons), Settings Panel (539×264 with
 * Notifications / Downloads / Language / Help & Support chevron rows), a
 * "My List" poster row (196×262) and a red glass Sign Out button.
 */
function ProfileInner() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    api
      .watchlist()
      .then(setItems)
      .catch(() => undefined);
  }, []);

  const name = user?.profile?.displayName ?? user?.email ?? '';
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const visible = items.filter((i) => i.title).slice(0, 5);

  const signOut = async () => {
    await logout();
    router.push('/');
  };

  return (
    <MobileShell>
      <h1 className="pt-2 font-readex text-[28px] font-bold text-white">Profile</h1>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[520px_1fr]">
        {/* Account Card — 42:14491 */}
        <div
          className="lg-glass relative min-h-[264px] rounded-[18px] p-8"
          style={{ background: 'rgba(214,214,214,0.08)' }}
        >
          <div className="flex items-start gap-5">
            <span
              className="lg-glass grid h-[88px] w-[88px] shrink-0 place-items-center rounded-[44px] text-[26px] font-semibold text-white"
              style={{ background: 'rgba(99,102,241,0.35)' }}
            >
              {initials}
            </span>
            <div className="min-w-0 pt-3">
              <p className="truncate font-readex text-[22px] font-bold leading-none text-white">
                {name}
              </p>
              <p className="mt-2.5 truncate text-[13px] text-white/55">{user?.email}</p>
              <p className="mt-2 text-[13px] font-semibold text-[#6c6ffc]">
                Premium&nbsp;&nbsp;•&nbsp;&nbsp;renews Aug 2026
              </p>
            </div>
          </div>
          <div className="mt-12 flex gap-4">
            <Link
              href="/settings"
              className="lg-glass flex h-11 flex-1 items-center justify-center rounded-[12px] text-[13.5px] font-semibold text-white"
              style={{ background: 'rgba(99,102,241,0.3)' }}
            >
              Edit Profile
            </Link>
            <Link
              href="/payments"
              className="lg-glass flex h-11 flex-1 items-center justify-center rounded-[12px] text-[13.5px] font-semibold text-white"
              style={{ background: 'rgba(214,214,214,0.1)' }}
            >
              Manage Plan
            </Link>
          </div>
        </div>

        {/* Settings Panel — 42:14501 */}
        <div
          className="lg-glass min-h-[264px] rounded-[18px] px-7 py-1.5"
          style={{ background: 'rgba(214,214,214,0.08)' }}
        >
          {ROWS.map((r, i) => (
            <Link
              key={r.label}
              href={r.href}
              className={`flex h-[63px] items-center justify-between ${i > 0 ? 'border-t border-white/[.08]' : ''}`}
            >
              <span className="flex items-center gap-3 text-[15px] text-white/90">
                <Glyph name={r.icon} /> {r.label}
              </span>
              <span className="text-lg text-white/40">›</span>
            </Link>
          ))}
        </div>
      </div>

      {/* My List — 42:14513 */}
      <section className="mt-12">
        <div className="flex items-end justify-between">
          <h2 className="font-readex text-xl font-medium text-white">My List</h2>
          <Link href="/watchlist" className="text-sm font-semibold text-[#6c6ffc]">
            See all
          </Link>
        </div>
        <div className="mt-6 flex gap-[30px] overflow-x-auto pb-2 [scrollbar-width:none]">
          {visible.map(
            (item) =>
              item.title && (
                <ListPoster
                  key={item.titleId}
                  id={item.title.id}
                  title={item.title.title}
                  posterUrl={item.title.posterUrl}
                />
              ),
          )}
          {visible.length === 0 && (
            <p className="text-sm text-white/50">
              Nothing saved yet — browse and tap ♡ to add titles.
            </p>
          )}
        </div>
      </section>

      {/* Sign Out — 42:14520 */}
      <button
        onClick={() => void signOut()}
        className="lg-glass mb-6 mt-12 h-11 w-[220px] rounded-[12px] text-[13.5px] font-semibold text-[#ff7373]"
        style={{ background: 'rgba(242,77,77,0.12)' }}
      >
        Sign Out
      </button>
    </MobileShell>
  );
}

function ListPoster({
  id,
  title,
  posterUrl,
}: {
  id: string;
  title: string;
  posterUrl: string | null;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <Link
      href={`/title?id=${id}`}
      className="block h-[262px] w-[196px] flex-shrink-0 overflow-hidden rounded-[14px]"
    >
      {!broken ? (
        <img
          src={posterUrl ?? `/art/posters/${id}.jpg`}
          alt={title}
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center p-2 text-center text-xs font-semibold text-white"
          style={{ background: gradientCss(id) }}
        >
          {title}
        </div>
      )}
    </Link>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileInner />
    </RequireAuth>
  );
}
