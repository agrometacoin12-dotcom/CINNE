'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';
import { artPoster } from '@/lib/poster';

/**
 * Who's Watching — exact Figma (node 42:14753): poster-collage backdrop + scrim,
 * "Who's watching?" heading, a 2×2 grid of round profiles (colored initials) plus
 * an "Add profile" tile, and a glass "Manage Profiles" pill.
 */
function WhoIsWatching() {
  const router = useRouter();
  const { user } = useAuth();

  const me = (user?.profile?.displayName ?? user?.email ?? 'You').split(' ')[0];
  const meInit = me.slice(0, 2).toUpperCase();

  const profiles = [
    { initials: meInit, name: me, color: '#6366f1' },
    { initials: 'SG', name: 'Shams', color: '#8a5a34' },
    { initials: 'KD', name: 'Kids', color: '#2f7d5b' },
  ];

  return (
    <main className="relative flex min-h-screen justify-center overflow-hidden bg-[#09090b]">
      <div className="relative flex w-full max-w-[430px] flex-col items-center px-6">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artPoster('profiles-collage')} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-black/55" />
        </div>

        <div className="relative z-10 mt-[14vh] text-center">
          <h1 className="font-readex text-[28px] font-bold text-white">Who&apos;s watching?</h1>
          <p className="mt-1 text-[13px] text-white/60">Pick a profile to continue</p>
        </div>

        <div className="relative z-10 mt-10 grid grid-cols-2 gap-x-10 gap-y-8">
          {profiles.map((p) => (
            <button key={p.name} onClick={() => router.push('/browse')} className="flex flex-col items-center gap-2.5">
              <span className="grid h-[104px] w-[104px] place-items-center rounded-full text-3xl font-bold text-white" style={{ background: p.color }}>
                {p.initials}
              </span>
              <span className="text-[14px] text-white/85">{p.name}</span>
            </button>
          ))}
          <div className="flex flex-col items-center gap-2.5">
            <span className="grid h-[104px] w-[104px] place-items-center rounded-full bg-white/[0.06] text-3xl text-white/70 lg-glass">+</span>
            <span className="text-[14px] text-white/60">Add profile</span>
          </div>
        </div>

        <button className="relative z-10 mt-14 rounded-[12px] px-6 py-3 text-[14px] font-semibold text-white lg-glass">
          Manage Profiles
        </button>
      </div>
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
