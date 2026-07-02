'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';

/* eslint-disable @next/next/no-img-element */
/**
 * Who's Watching — exact Figma web frame 42:15284 (and iPhone 42:14753 on
 * mobile): poster-wall backdrop + scrim, big C logo, "Who's watching?" heading,
 * a row of 140px round profiles (initials) plus an "Add profile" tile, and a
 * glass "Manage Profiles" button (220×48).
 */
function WhoIsWatching() {
  const router = useRouter();
  const { user } = useAuth();

  const me = (user?.profile?.displayName ?? user?.email ?? 'You').split(' ')[0];
  const meInit = me.slice(0, 2).toUpperCase();

  const profiles = [
    { initials: meInit, name: me, color: 'rgba(99,102,241,0.55)' },
    { initials: 'SG', name: 'brother', color: 'rgba(138,90,52,0.6)' },
    { initials: 'KD', name: 'Kids', color: 'rgba(47,125,91,0.6)' },
  ];

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden bg-[#090b12] px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src="/art/figma/poster-wall.png"
          alt=""
          className="absolute left-1/2 top-1/2 h-[100vw] w-[100vh] max-w-none min-w-[100vh] -translate-x-1/2 -translate-y-1/2 rotate-90 object-cover opacity-25"
        />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      {/* C logo — 42:15971 */}
      <img
        src="/art/figma/c-logo.png"
        alt=""
        className="relative z-10 mt-[10vh] h-[100px] w-[100px] object-cover sm:mt-[151px] sm:h-[129px] sm:w-[129px]"
      />

      <div className="relative z-10 mt-8 text-center sm:mt-0 sm:pt-0">
        <h1 className="font-readex text-[28px] font-bold text-white sm:text-[38px]">
          Who&apos;s watching?
        </h1>
        <p className="mt-2.5 text-[13px] text-white/60 sm:text-sm">Pick a profile to continue</p>
      </div>

      {/* Profiles — 140×140 tiles, single row on desktop (42:15290…15301) */}
      <div className="relative z-10 mt-10 grid grid-cols-2 gap-x-10 gap-y-8 sm:mt-[68px] sm:flex sm:gap-[60px]">
        {profiles.map((p) => (
          <button
            key={p.name}
            onClick={() => router.push('/browse')}
            className="flex flex-col items-center gap-4"
          >
            <span
              className="lg-glass grid h-[104px] w-[104px] place-items-center rounded-full text-3xl font-bold text-white sm:h-[140px] sm:w-[140px] sm:text-[40px]"
              style={{ background: p.color }}
            >
              {p.initials}
            </span>
            <span className="text-[14px] text-white/85">{p.name}</span>
          </button>
        ))}
        <div className="flex flex-col items-center gap-4">
          <span
            className="lg-glass grid h-[104px] w-[104px] place-items-center rounded-full text-3xl text-white/70 sm:h-[140px] sm:w-[140px] sm:text-[40px]"
            style={{ background: 'rgba(214,214,214,0.06)' }}
          >
            +
          </span>
          <span className="text-[14px] text-white/60">Add profile</span>
        </div>
      </div>

      {/* Manage Profiles — 220×48 (42:15302) */}
      <button className="lg-glass relative z-10 mt-14 h-12 w-[220px] rounded-[12px] text-[14px] font-semibold text-white sm:mt-[66px]">
        Manage Profiles
      </button>
    </main>
  );
}

export default function ProfilesPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <WhoIsWatching />
      </Suspense>
    </RequireAuth>
  );
}
