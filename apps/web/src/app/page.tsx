'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Marketing landing — exact Figma frames 51:16001 (desktop 1440×4420) and
 * 65:521 (mobile 393×2060). Desktop: glass nav with C-logo, hero collage at 25%
 * + floating tilted posters, 76px Baloo headline, Trending ranks (88px), Now
 * Streaming banner, stats, genre chips, feature cards, device showcase,
 * testimonials, FAQ (900px), CTA band. Mobile: bare logo header, 36px headline,
 * stacked email/CTA, 3-poster scroll row (56px ranks), icon-row features,
 * stacked stats, compact CTA band. Sections absent from the mobile frame
 * (banner, genres, devices, quotes, FAQ) are hidden below `sm`.
 * Background #090b12 · accent #6c6ffc · glass insets from globals.css (lg-*).
 */
const GENRES: [string, boolean][] = [
  ['Action', true],
  ['Sci-Fi', false],
  ['Comedy', false],
  ['Thriller', true],
  ['Romance', false],
  ['Horror', false],
  ['Animation', true],
  ['Documentary', false],
  ['Drama', false],
  ['Fantasy', true],
  ['Crime', false],
  ['K-Drama', false],
  ['Anime', true],
  ['Classics', false],
];
const FEATURES = [
  {
    icon: '/art/figma/icon-screen.svg',
    title: 'Watch anywhere',
    body: 'Phone, laptop, TV — your temple follows you across every screen.',
    mobileBody: 'Phone, laptop, TV — your temple follows you everywhere.',
  },
  {
    icon: '/art/figma/icon-download.svg',
    title: 'Download & go',
    body: 'Save titles for offline and watch on the subway, plane, anywhere.',
    mobileBody: 'Save titles for offline and watch anywhere, anytime.',
  },
  {
    icon: '/art/figma/icon-profiles.svg',
    title: 'Profiles for everyone',
    body: 'Separate profiles and kid-safe spaces for the whole family.',
    mobileBody: 'Separate profiles and kid-safe spaces for the family.',
  },
];
const TESTIMONIALS = [
  { quote: '“I cancelled two other services. The temple has everything.”', who: 'Maya · Lagos' },
  { quote: '“Downloads saved my last three flights. Absolute lifesaver.”', who: 'Tunde · London' },
  { quote: '“The kids profile means I finally trust autoplay again.”', who: 'Sara · Dubai' },
];
const FAQ = [
  'What is Cinnetemple?',
  'How much does it cost?',
  'Can I watch offline?',
  'How do I cancel?',
];
const STATS = [
  ['12,000+', 'titles to explore'],
  ['4K HDR', 'cinema-grade quality'],
  ['190+', 'countries streaming'],
];
const TRENDS = [
  '/art/figma/floating-poster-1.png',
  '/art/figma/floating-poster-2.png',
  '/art/figma/trend-3.png',
  '/art/figma/trend-4.png',
  '/art/figma/floating-poster-1.png',
  '/art/figma/floating-poster-2.png',
];

/* eslint-disable @next/next/no-img-element */
export default function Landing() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#090b12] text-white">
      {/* Nav — desktop: glass pill 1200×64 (51:16007) · mobile: bare logo row (65:525…528) */}
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-8 sm:pt-8">
        <nav className="lg-soft relative mx-auto flex h-[34px] max-w-[1200px] items-center max-sm:!bg-transparent max-sm:!shadow-none max-sm:![backdrop-filter:none] sm:h-16 sm:rounded-[18px] sm:px-4">
          <Link href="/" className="flex items-center gap-2.5 sm:pl-2">
            <img
              src="/art/figma/c-logo.png"
              alt=""
              className="h-[30px] w-[30px] object-contain sm:h-9 sm:w-9"
            />
            <span className="font-logo text-lg font-bold text-white sm:text-2xl">Cinnetemple</span>
          </Link>
          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-[76px] md:flex">
            <a className="text-sm text-white/75 hover:text-white" href="#trending">
              Movies
            </a>
            <a className="text-sm text-white/75 hover:text-white" href="#genres">
              TV Shows
            </a>
            <a className="text-sm text-white/75 hover:text-white" href="#faq">
              Pricing
            </a>
          </div>
          <Link
            href="/login"
            className="ml-auto grid h-[34px] w-[84px] place-items-center rounded-[10px] lg-glass-indigo text-[12.5px] font-semibold text-white sm:h-10 sm:w-[110px] sm:rounded-[11px] sm:text-[13.5px]"
          >
            Sign In
          </Link>
        </nav>
      </header>

      {/* Hero — collage at 25% + scrim + glow + floating posters (51:16002…16006 / 65:522…536) */}
      <section className="relative flex h-[560px] flex-col items-center justify-center overflow-hidden px-6 text-center sm:h-[820px]">
        <img
          src="/art/figma/hero-collage.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(9,11,18,0.2) 0%, rgba(9,11,18,0.55) 70%, #090b12 100%), rgba(0,0,0,0.55)',
          }}
        />
        <div className="pointer-events-none absolute left-1/2 top-[120px] h-[220px] w-[360px] -translate-x-1/2 sm:top-[115px] sm:h-[452px] sm:w-[949px] sm:max-w-[95vw]">
          <img src="/art/figma/headline-glow.svg" alt="" className="h-full w-full" />
        </div>

        {/* Floating posters — 190×260, −8° / 9°, white/18 border (desktop only) */}
        <div className="absolute left-[120px] top-[224px] hidden -rotate-[8deg] xl:block">
          <img
            src="/art/figma/floating-poster-1.png"
            alt=""
            className="h-[260px] w-[190px] rounded-2xl border border-white/[.18] object-cover shadow-[0px_16px_40px_0px_rgba(0,0,0,0.5)]"
          />
        </div>
        <div className="absolute right-[122px] top-[210px] hidden rotate-[9deg] xl:block">
          <img
            src="/art/figma/floating-poster-2.png"
            alt=""
            className="h-[260px] w-[190px] rounded-2xl border border-white/[.18] object-cover shadow-[0px_16px_40px_0px_rgba(0,0,0,0.5)]"
          />
        </div>

        <div className="relative z-10 w-full sm:mt-10">
          <h1 className="font-logo text-4xl font-bold leading-[1.22] sm:text-[76px] sm:leading-[1.2]">
            All your movies.
            <br />
            <span className="text-[#6c6ffc]">One temple.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[13.5px] leading-[1.6] text-white/75 sm:mt-7 sm:text-lg">
            Stream thousands of movies and shows
            <span className="hidden sm:inline"> in one place</span>.<br /> No ads. No limits. Just
            press play.
          </p>
          <div className="mx-auto mt-[26px] flex w-full max-w-[345px] flex-col items-center gap-3 sm:mt-[54px] sm:max-w-[576px] sm:flex-row sm:gap-4">
            <input
              placeholder="Enter your email"
              className="lg-soft h-12 w-full flex-1 rounded-[13px] px-[18px] text-[13.5px] text-white outline-none placeholder:text-white/50 sm:h-[54px] sm:rounded-[14px] sm:px-5 sm:text-[14.5px]"
            />
            <Link
              href="/register"
              className="lg-glass-indigo-35 flex h-12 w-full items-center justify-center rounded-[13px] text-sm font-semibold text-white sm:h-[54px] sm:w-[180px] sm:rounded-[14px] sm:text-[15px]"
            >
              <span className="sm:hidden">Get Started</span>
              <span className="hidden sm:inline">Get Started&nbsp;&nbsp;→</span>
            </Link>
          </div>
          <p className="mt-4 text-xs text-white/50 sm:mt-6 sm:text-[13px]">
            Free 30-day trial&nbsp;&nbsp;•&nbsp;&nbsp;Cancel anytime
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-6">
        {/* Trending — desktop grid 184×246 / 88px ranks · mobile scroll 150×200 / 56px ranks */}
        <section id="trending" className="pt-10 sm:pt-[60px]">
          <h2 className="font-logo text-[22px] font-semibold sm:text-[30px]">Trending this week</h2>
          {/* Mobile: horizontal scroll (65:538…543) */}
          <div className="-mx-6 mt-3 flex gap-3 overflow-x-auto px-6 pb-[70px] sm:hidden">
            {TRENDS.map((src, i) => (
              <div key={i} className="relative shrink-0">
                <img src={src} alt="" className="h-[200px] w-[150px] rounded-xl object-cover" />
                <span
                  className="font-logo absolute -left-2.5 top-[142px] text-[56px] font-bold leading-none text-[#6c6ffc]"
                  style={{ textShadow: '0 4px 12px rgba(0,0,0,0.6)' }}
                >
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
          {/* Desktop grid (51:16024…16035) */}
          <div className="mt-[26px] hidden grid-cols-6 gap-x-5 pb-[104px] sm:grid">
            {TRENDS.map((src, i) => (
              <div key={i} className="relative">
                <img
                  src={src}
                  alt=""
                  className="aspect-[184/246] w-full rounded-[14px] object-cover"
                />
                <span
                  className="font-logo absolute -left-4 top-[150px] text-[88px] font-bold leading-none text-[#6c6ffc]"
                  style={{ textShadow: '0 6px 16px rgba(0,0,0,0.6)' }}
                >
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Now streaming — spotlight banner 1200×420 (51:16038, desktop only) */}
        <section className="hidden sm:block">
          <p className="text-[13px] font-semibold tracking-[2.08px] text-[#6c6ffc]">
            NOW STREAMING
          </p>
          <h2 className="mt-1.5 font-logo text-[30px] font-semibold">The event of the year</h2>
          <div className="relative mt-7 h-[420px] overflow-hidden rounded-[24px] bg-[#090b12] shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            <img
              src="/art/figma/spotlight.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(90deg, rgba(9,11,18,0.95) 0%, rgba(9,11,18,0.4) 60%, rgba(9,11,18,0) 100%)',
              }}
            />
            <div className="relative h-full px-[56px]">
              <h3 className="font-logo pt-[86px] text-[52px] font-bold">Spiderman</h3>
              <p className="mt-2 text-sm text-white/75">
                2025&nbsp;&nbsp;•&nbsp;&nbsp;Sci-fi&nbsp;&nbsp;•&nbsp;&nbsp;2h
                36m&nbsp;&nbsp;•&nbsp;&nbsp;★ 9.1
              </p>
              <p className="mt-2 max-w-[400px] text-[15px] leading-[1.6] text-white/85">
                Miles Morales swings into the year&apos;s most thrilling multiverse adventure.
              </p>
              <div className="mt-8 flex gap-4">
                <Link
                  href="/browse"
                  className="lg-glass flex h-[50px] w-40 items-center justify-center rounded-[13px] text-[14.5px] font-semibold text-white"
                  style={{ background: 'rgba(99,102,241,0.45)' }}
                >
                  ▶&nbsp;&nbsp;Watch now
                </Link>
                <Link
                  href="/browse"
                  className="lg-glass flex h-[50px] w-[140px] items-center justify-center rounded-[13px] text-[14.5px] font-semibold text-white"
                  style={{ background: 'rgba(214,214,214,0.12)' }}
                >
                  More info
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features — desktop 384×220 cards · mobile 345×110 icon rows (65:545…567) */}
        <section className="pt-4 text-center sm:pt-[86px]">
          <h2 className="font-logo text-[22px] font-semibold sm:text-[30px]">
            Built for movie lovers
          </h2>
          {/* Mobile rows */}
          <div className="mx-auto mt-5 flex max-w-[345px] flex-col gap-4 text-left sm:hidden">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex h-[110px] items-center gap-4 rounded-[18px] lg-glass px-5"
                style={{ background: 'rgba(214,214,214,0.07)' }}
              >
                <span
                  className="lg-glass grid h-12 w-12 shrink-0 place-items-center rounded-[24px]"
                  style={{ background: 'rgba(99,102,241,0.25)' }}
                >
                  <img src={f.icon} alt="" className="h-[22px] w-[22px]" />
                </span>
                <div>
                  <p className="font-logo text-base font-semibold">{f.title}</p>
                  <p className="mt-1 max-w-[240px] text-xs leading-[1.5] text-white/65">
                    {f.mobileBody}
                  </p>
                </div>
              </div>
            ))}
          </div>
          {/* Desktop cards */}
          <div className="mt-[30px] hidden grid-cols-3 gap-6 text-left sm:grid">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="h-[220px] rounded-[20px] lg-glass p-7"
                style={{ background: 'rgba(214,214,214,0.07)' }}
              >
                <span
                  className="lg-glass grid h-14 w-14 place-items-center rounded-[28px]"
                  style={{ background: 'rgba(99,102,241,0.25)' }}
                >
                  <img src={f.icon} alt="" className="h-6 w-6" />
                </span>
                <p className="font-logo mt-4 text-xl font-semibold">{f.title}</p>
                <p className="mt-2 max-w-[328px] text-[13.5px] leading-[1.6] text-white/65">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Stats — desktop 3-across 48px · mobile stacked 34px (65:568…573) */}
        <section className="grid grid-cols-1 gap-8 pt-16 text-center sm:grid-cols-3 sm:pt-[80px]">
          {STATS.map(([n, l]) => (
            <div key={n}>
              <p className="font-logo text-[34px] font-bold text-[#6c6ffc] sm:text-5xl">{n}</p>
              <p className="mt-0.5 text-[12.5px] text-white/60 sm:mt-3 sm:text-sm">{l}</p>
            </div>
          ))}
        </section>

        {/* Genres — chips h-40, active indigo 0.22 / idle 0.07 (51:16055…16081, desktop only) */}
        <section id="genres" className="hidden pt-[76px] text-center sm:block">
          <h2 className="font-logo text-[30px] font-semibold">Every genre. Every mood.</h2>
          <div className="mx-auto mt-[30px] flex max-w-[800px] flex-wrap justify-center gap-x-3.5 gap-y-3.5">
            {GENRES.map(([g, hot]) => (
              <span
                key={g}
                className="lg-glass grid h-10 place-items-center rounded-[20px] px-6 text-sm text-white/85"
                style={{ background: hot ? 'rgba(99,102,241,0.22)' : 'rgba(214,214,214,0.07)' }}
              >
                {g}
              </span>
            ))}
          </div>
        </section>

        {/* Device showcase — TV + stand, laptop + base, phone (51:16100…16108, desktop only) */}
        <section className="hidden pt-[80px] text-center lg:block">
          <h2 className="font-logo text-[30px] font-semibold">On all your screens</h2>
          <div
            className="relative mt-[30px] h-[440px] overflow-hidden rounded-[24px] lg-glass"
            style={{ background: 'rgba(214,214,214,0.05)' }}
          >
            <div className="absolute left-[60px] top-10 h-[330px] w-[560px] overflow-hidden rounded-[14px] border-[3px] border-white/25 bg-black">
              <img src="/art/figma/spotlight.png" alt="" className="h-full w-full object-cover" />
            </div>
            <div className="absolute left-[260px] top-[378px] h-2 w-40 rounded-[4px] bg-white/20" />
            <div className="absolute left-[680px] top-[90px] h-[220px] w-[340px] overflow-hidden rounded-[10px] border-[3px] border-white/25 bg-black">
              <img src="/art/figma/spotlight.png" alt="" className="h-full w-full object-cover" />
            </div>
            <div className="absolute left-[650px] top-[310px] h-2.5 w-[400px] rounded-[5px] bg-white/20" />
            <div className="absolute left-[1010px] top-[110px] h-[240px] w-[120px] overflow-hidden rounded-[20px] border-[3px] border-white/30 bg-black">
              <img
                src="/art/figma/floating-poster-2.png"
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* Testimonials — 384×190 cards (51:16110…16121, desktop only) */}
        <section className="hidden pt-[80px] text-center sm:block">
          <h2 className="font-logo text-[30px] font-semibold">People can&apos;t stop watching</h2>
          <div className="mt-[30px] grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.who}
                className="relative h-[190px] rounded-[20px] lg-glass p-7"
                style={{ background: 'rgba(214,214,214,0.07)' }}
              >
                <p className="text-[15px] text-[#6c6ffc]">★★★★★</p>
                <p className="mt-2 max-w-[328px] text-[14.5px] leading-[1.65] text-white/85">
                  {t.quote}
                </p>
                <p className="absolute bottom-[30px] left-7 text-[12.5px] font-semibold text-white/50">
                  {t.who}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ — rows 900×64 (51:16123…16134, desktop only) */}
        <section id="faq" className="hidden pt-[80px] text-center sm:block">
          <h2 className="font-logo text-[30px] font-semibold">Questions? Answered.</h2>
          <div className="mx-auto mt-[30px] flex max-w-[900px] flex-col gap-3 text-left">
            {FAQ.map((q, i) => (
              <button
                key={q}
                onClick={() => setOpen(open === i ? null : i)}
                className="flex h-16 items-center justify-between rounded-[14px] lg-glass px-7"
                style={{ background: 'rgba(214,214,214,0.06)' }}
              >
                <span className="text-[15px] font-semibold text-white/90">{q}</span>
                <span className="font-logo text-2xl font-semibold text-[#6c6ffc]">
                  {open === i ? '−' : '+'}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* CTA band — desktop 1200×280 · mobile 345×200 (51:16135… / 65:574…579) */}
        <section className="pt-12 sm:pt-[68px]">
          <div className="relative mx-auto h-[200px] max-w-[345px] overflow-hidden rounded-[20px] bg-[#090b12] text-center sm:h-[280px] sm:max-w-none sm:rounded-[26px]">
            <img
              src="/art/figma/hero-collage.png"
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-25"
            />
            <div className="absolute inset-0 bg-[rgba(13,13,31,0.85)] sm:bg-[rgba(13,13,31,0.82)]" />
            <div className="relative">
              <h2 className="font-logo pt-9 text-2xl font-bold leading-[1.25] sm:pt-16 sm:text-[40px] sm:leading-normal">
                <span className="sm:hidden">
                  Ready to enter
                  <br />
                  the temple?
                </span>
                <span className="hidden sm:inline">Ready to enter the temple?</span>
              </h2>
              <p className="mt-2.5 hidden text-[15px] text-white/75 sm:block">
                Start your free 30-day trial today. No card required.
              </p>
              <Link
                href="/register"
                className="mx-auto mt-[22px] flex h-[46px] w-[180px] items-center justify-center rounded-[13px] lg-glass text-[13.5px] font-semibold text-white sm:mt-[26px] sm:h-[54px] sm:w-[220px] sm:rounded-[14px] sm:text-[15px]"
                style={{ background: 'rgba(99,102,241,0.5)' }}
              >
                Start Watching
              </Link>
            </div>
          </div>
        </section>

        {/* Footer (51:16142…16146 / 65:580…584) */}
        <footer className="mt-12 border-t border-white/[.08] pb-10 pt-5 sm:mt-10 sm:pt-[26px]">
          <div className="flex items-center justify-between sm:hidden">
            <div className="flex items-center gap-2">
              <img src="/art/figma/c-logo.png" alt="" className="h-6 w-6 object-contain" />
              <span className="font-logo text-[15px] font-semibold">Cinnetemple</span>
            </div>
            <p className="text-[11.5px] text-white/55">
              About&nbsp;&nbsp;&nbsp;Help&nbsp;&nbsp;&nbsp;Terms&nbsp;&nbsp;&nbsp;Privacy
            </p>
          </div>
          <p className="mt-4 text-[11px] text-white/40 sm:hidden">© 2026 Cinnetemple</p>
          <div className="hidden flex-col items-center justify-between gap-4 sm:flex sm:flex-row">
            <div className="flex items-center gap-2.5">
              <img src="/art/figma/c-logo.png" alt="" className="h-7 w-7 object-contain" />
              <span className="font-logo text-lg font-semibold">Cinnetemple</span>
            </div>
            <p className="text-[13px] text-white/55">
              About&nbsp;&nbsp;&nbsp;&nbsp;Careers&nbsp;&nbsp;&nbsp;&nbsp;Help
              Center&nbsp;&nbsp;&nbsp;&nbsp;Terms&nbsp;&nbsp;&nbsp;&nbsp;Privacy
            </p>
            <p className="text-[12.5px] text-white/40">© 2026 Cinnetemple</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
