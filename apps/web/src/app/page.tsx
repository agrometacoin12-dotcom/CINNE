import Link from 'next/link';
import { artPoster } from '@/lib/poster';

const ROWS = [0, 1, 2].map((r) => Array.from({ length: 10 }, (_, i) => `landing-${r}-${i}`));

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-9 overflow-hidden bg-[#0b0b0d] py-16 font-readex">
      {/* Brand */}
      <div className="flex flex-col items-center gap-3 px-4 text-center">
        <h1 className="text-gradient text-5xl font-bold tracking-tight sm:text-6xl">CinneTemple</h1>
        <p className="text-lg text-white/65">Your cinema, reimagined.</p>
      </div>

      {/* Shimmering poster rows */}
      <div className="flex w-full flex-col gap-3.5">
        {ROWS.map((row, r) => (
          <div
            key={r}
            className="flex justify-center gap-3 overflow-hidden px-4"
            style={{
              WebkitMaskImage:
                'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
              maskImage:
                'linear-gradient(to right, transparent, black 12%, black 88%, transparent)',
            }}
          >
            {row.map((seed) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={seed}
                src={artPoster(seed)}
                alt=""
                className="h-36 w-24 flex-shrink-0 rounded-xl object-cover ring-1 ring-white/10"
              />
            ))}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex w-full max-w-sm flex-col gap-3 px-6">
        <Link
          href="/register"
          className="btn-glossy w-full rounded-full py-3.5 text-center text-sm font-semibold text-white"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="glass w-full rounded-full py-3.5 text-center text-sm font-semibold text-[var(--text-primary)] transition hover:brightness-125"
        >
          I already have an account
        </Link>
      </div>

      <p className="px-4 text-center text-sm text-white/45">
        Pay once · Watch once · Premieres, live
      </p>
    </main>
  );
}
