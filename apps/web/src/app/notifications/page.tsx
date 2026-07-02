'use client';

import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/app/MobileShell';

type Note = {
  icon: 'film' | 'play' | 'download' | 'star';
  title: string;
  body: string;
  time: string;
  promo?: boolean;
};

const TODAY: Note[] = [
  {
    icon: 'film',
    title: 'New on Cinnetemple',
    body: 'Alita: Battle Angel is now streaming',
    time: '2h',
  },
  { icon: 'play', title: 'New episode', body: 'Spider-Verse S1 E5 just dropped', time: '5h' },
];
const EARLIER: Note[] = [
  {
    icon: 'download',
    title: 'Download complete',
    body: 'The Wolf of Wall Street is ready to watch offline',
    time: '1d',
  },
  {
    icon: 'star',
    title: 'Lifetime offer',
    body: 'Pay once, watch forever — 40% off today only',
    time: '2d',
    promo: true,
  },
];

function Glyph({ name }: { name: Note['icon'] }) {
  const c = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'film':
      return (
        <svg {...c}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
        </svg>
      );
    case 'play':
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 9l5 3-5 3V9Z" />
        </svg>
      );
    case 'download':
      return (
        <svg {...c}>
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      );
    case 'star':
      return (
        <svg {...c}>
          <path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8Z" />
        </svg>
      );
  }
}

/**
 * Notifications — exact Figma web frame 42:14958: "Today" / "Earlier" sections
 * (Manrope SemiBold 20, white/90) of full-width 78px glass rows (0.07; promo
 * rows indigo 0.18 with an indigo 0.4 icon circle), 40px icon circle, 13.5px
 * semibold title, 11.5px body, 11px time. Mobile keeps the iPhone frame's
 * back / title / Clear all header (42:15304).
 */
export default function NotificationsPage() {
  const router = useRouter();
  const row = (n: Note) => (
    <div
      key={n.title}
      className="lg-glass relative h-[78px] w-full rounded-[14px]"
      style={{ background: n.promo ? 'rgba(99,102,241,0.18)' : 'rgba(214,214,214,0.07)' }}
    >
      <span
        className="absolute left-3.5 top-[19px] grid h-10 w-10 place-items-center rounded-[20px] text-white/90"
        style={{ background: n.promo ? 'rgba(99,102,241,0.4)' : 'rgba(214,214,214,0.12)' }}
      >
        <Glyph name={n.icon} />
      </span>
      <div className="absolute left-[66px] top-4 w-[240px]">
        <p className="text-[13.5px] font-semibold text-white">{n.title}</p>
        <p className="mt-1 text-[11.5px] leading-[1.4] text-white/60">{n.body}</p>
      </div>
      <span className="absolute left-[330px] top-4 hidden text-[11px] text-white/40 sm:block">
        {n.time}
      </span>
      <span className="absolute right-4 top-4 text-[11px] text-white/40 sm:hidden">{n.time}</span>
    </div>
  );

  return (
    <MobileShell>
      {/* Mobile header — iPhone frame 42:15304 */}
      <div className="mb-6 flex items-center justify-between pt-2 lg:hidden">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="lg-glass grid h-10 w-10 place-items-center rounded-[20px] text-lg text-white"
        >
          ←
        </button>
        <h1 className="font-readex text-[20px] font-bold text-white">Notifications</h1>
        <button className="text-[13px] font-semibold text-[#6c6ffc]">Clear all</button>
      </div>

      <section className="pt-2">
        <p className="font-readex text-xl font-semibold text-white/90">Today</p>
        <div className="mt-2.5 flex flex-col gap-3">{TODAY.map(row)}</div>
      </section>

      <section className="mt-10">
        <p className="font-readex text-xl font-semibold text-white/90">Earlier</p>
        <div className="mt-2.5 flex flex-col gap-3">{EARLIER.map(row)}</div>
      </section>
    </MobileShell>
  );
}
