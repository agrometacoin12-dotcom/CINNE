import Link from 'next/link';

export default function LandingPage() {
  return (
    <section className="font-readex relative h-screen w-full overflow-hidden bg-black">
      {/* Background video */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_063509_7d167302-4fd4-480b-8260-18ab572333d4.mp4"
      />

      {/* Navbar */}
      <nav className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-4 px-6 pt-6 md:px-10">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full bg-neutral-900/90 py-3 pl-4 pr-6 backdrop-blur"
        >
          <svg viewBox="0 0 256 256" className="h-5 w-5" aria-hidden="true">
            <path
              fill="#ffffff"
              d="M 128 192 L 128 256 L 64.5 256 L 32 223 L 0 192 L 0 128 L 64 128 Z M 256 192 L 256 256 L 192.5 256 L 160 223 L 128 192 L 128 128 L 192 128 Z M 128 64 L 128 128 L 64.5 128 L 32 95 L 0 64 L 0 0 L 64 0 Z M 256 64 L 256 128 L 192.5 128 L 160 95 L 128 64 L 128 0 L 192 0 Z"
            />
          </svg>
          <span className="text-sm font-normal tracking-tight text-white">cinnetemple</span>
        </Link>

        <div className="hidden items-center gap-1 rounded-full bg-neutral-900/90 px-3 py-2 backdrop-blur md:flex">
          <Link
            href="/browse"
            className="rounded-full px-5 py-2 text-sm text-neutral-300 transition-colors hover:text-white"
          >
            browse
          </Link>
          <Link
            href="/browse"
            className="rounded-full px-5 py-2 text-sm text-neutral-300 transition-colors hover:text-white"
          >
            movies
          </Link>
          <Link
            href="/browse"
            className="rounded-full px-5 py-2 text-sm text-neutral-300 transition-colors hover:text-white"
          >
            series
          </Link>
          <Link
            href="/login"
            className="rounded-full px-5 py-2 text-sm text-neutral-300 transition-colors hover:text-white"
          >
            sign in
          </Link>
        </div>

        <Link
          href="/register"
          className="rounded-full bg-white px-6 py-3 text-sm font-normal text-black transition-colors hover:bg-neutral-200"
        >
          get started
        </Link>
      </nav>

      {/* Foreground content */}
      <div className="relative z-10 h-full w-full">
        <h1 className="hero-title absolute left-4 top-[18%] text-[14vw] font-medium text-white md:left-10 md:text-[13vw]">
          your
        </h1>
        <h1 className="hero-title absolute right-4 top-[38%] text-[14vw] font-medium text-white md:right-10 md:text-[13vw]">
          cinema
        </h1>
        <h1 className="hero-title absolute left-[18%] top-[58%] text-[14vw] font-medium text-white md:left-[28%] md:text-[13vw]">
          awaits
        </h1>

        <p className="absolute left-6 top-[46%] max-w-[240px] text-[15px] leading-snug text-white/90 md:left-10">
          stream thousands of films and series, beautifully — your cinema, reimagined, wherever you are
        </p>

        {/* Stat — top right */}
        <div className="absolute right-6 top-[14%] md:right-24">
          <div className="flex items-center justify-end gap-3">
            <span className="hidden h-px w-24 rotate-[20deg] bg-white/40 md:block" />
            <span className="text-4xl font-medium tracking-tight md:text-5xl">+12k</span>
          </div>
          <p className="mt-1 text-right text-xs text-white/70 md:text-sm">titles to stream</p>
        </div>

        {/* Stat — bottom left */}
        <div className="absolute bottom-20 left-6 md:bottom-24 md:left-20">
          <div className="flex items-center gap-3">
            <span className="text-4xl font-medium tracking-tight md:text-5xl">+1.2b</span>
            <span className="hidden h-px w-24 rotate-[-20deg] bg-white/40 md:block" />
          </div>
          <p className="mt-1 text-xs text-white/70 md:text-sm">minutes streamed</p>
        </div>

        {/* Stat — bottom right */}
        <div className="absolute bottom-16 right-6 md:bottom-20 md:right-20">
          <div className="flex items-center justify-end gap-3">
            <span className="hidden h-px w-24 rotate-[-20deg] bg-white/40 md:block" />
            <span className="text-4xl font-medium tracking-tight md:text-5xl">+300k</span>
          </div>
          <p className="mt-1 text-right text-xs text-white/70 md:text-sm">downloads</p>
        </div>
      </div>

      {/* Bottom gradient overlay */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-b from-transparent to-black" />
    </section>
  );
}
