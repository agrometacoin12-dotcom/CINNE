'use client';

import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/app/MobileShell';

type Note = { icon: 'film' | 'play' | 'download' | 'star'; title: string; body: string; time: string; promo?: boolean };

const TODAY: Note[] = [
  { icon: 'film', title: 'New on Cinnetemple', body: 'Alita: Battle Angel is now streaming', time: '2h' },
  { icon: 'play', title: 'New episode', body: 'Spider-Verse S1 E5 just dropped', time: '5h' },
];
const EARLIER: Note[] = [
  { icon: 'download', title: 'Download complete', body: 'The Wolf of Wall Street is ready to watch offline', time: '1d' },
  { icon: 'star', title: 'Lifetime offer', body: 'Pay once, watch forever — 40% off today only', time: '2d', promo: true },
];

function Glyph({ name }: { name: Note['icon'] }) {
  const c = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'film': return <svg {...c}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></svg>;
    case 'play': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M10 9l5 3-5 3V9Z" /></svg>;
    case 'download': return <svg {...c}><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>;
    case 'star': return <svg {...c}><path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8Z" /></svg>;
  }
}

/** Notifications — exact Figma (node 42:15304): back / title / Clear all top bar,
 *  Today & Earlier sections of glass notification rows (promo row indigo-tinted). */
export default function NotificationsPage() {
  const router = useRouter();
  const row = (n: Note) => (
    <div key={n.title} className={`flex items-center gap-3 rounded-[14px] px-4 py-3.5 ${n.promo ? 'lg-glass-indigo' : 'lg-glass'}`}>
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-white" style={{ background: n.promo ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)' }}>
        <Glyph name={n.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-white">{n.title}</p>
        <p className="truncate text-[12px] text-white/55">{n.body}</p>
      </div>
      <span className="text-[11px] text-white/40">{n.time}</span>
    </div>
  );

  return (
    <MobileShell showTopBar={false}>
      <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={() => router.back()} aria-label="Back" className="lg-glass grid h-10 w-10 place-items-center rounded-[20px] text-lg text-white">←</button>
        <h1 className="font-readex text-[20px] font-bold text-white">Notifications</h1>
        <button className="text-[13px] font-semibold text-[#6c6ffc]">Clear all</button>
      </div>

      <p className="text-[13px] text-white/50">Today</p>
      <div className="mt-3 flex flex-col gap-3">{TODAY.map(row)}</div>

      <p className="mt-7 text-[13px] text-white/50">Earlier</p>
      <div className="mt-3 flex flex-col gap-3">{EARLIER.map(row)}</div>
      </div>
    </MobileShell>
  );
}
