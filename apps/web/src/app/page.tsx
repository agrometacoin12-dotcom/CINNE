'use client';

import { useState } from 'react';
import Link from 'next/link';
import { artPoster } from '@/lib/poster';

/**
 * Desktop marketing landing — exact Figma Dev Mode export: glass nav, hero
 * ("All your movies. One temple."), Trending ranks, Now Streaming banner, stats,
 * genre chips, feature cards, device mockups, testimonials, FAQ, CTA, footer.
 * Baloo 2 headings (font-logo), Inter body, indigo #6366f1, liquid glass.
 */
const GENRES: [string, boolean][] = [
  ['Action', true], ['Sci-Fi', false], ['Comedy', false], ['Thriller', true], ['Romance', false],
  ['Horror', false], ['Animation', true], ['Documentary', false], ['Drama', false], ['Fantasy', true],
  ['Crime', false], ['K-Drama', false], ['Anime', true], ['Classics', false],
];
const FEATURES = [
  { title: 'Watch anywhere', body: 'Phone, laptop, TV — your temple follows you across every screen.' },
  { title: 'Download & go', body: 'Save titles for offline and watch on the subway, plane, anywhere.' },
  { title: 'Profiles for everyone', body: 'Separate profiles and kid-safe spaces for the whole family.' },
];
const TESTIMONIALS = [
  { quote: '“I cancelled two other services. The temple has everything.”', who: 'Maya · Lagos' },
  { quote: '“Downloads saved my last three flights. Absolute lifesaver.”', who: 'Tunde · London' },
  { quote: '“The kids profile means I finally trust autoplay again.”', who: 'Sara · Dubai' },
];
const FAQ = ['What is Cinnetemple?', 'How much does it cost?', 'Can I watch offline?', 'How do I cancel?'];
const STATS = [['12,000+', 'titles to explore'], ['4K HDR', 'cinema-grade quality'], ['190+', 'countries streaming']];

export default function Landing() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#09090b] text-white">
      {/* Nav */}
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-8">
        <nav className="mx-auto flex h-16 max-w-[1200px] items-center rounded-2xl lg-glass px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg cine-grad"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7L8 5Z" /></svg></span>
            <span className="font-logo text-2xl font-bold text-white">Cinnetemple</span>
          </Link>
          <div className="ml-auto hidden items-center gap-10 md:flex">
            <a className="text-sm text-white/75 hover:text-white" href="#trending">Movies</a>
            <a className="text-sm text-white/75 hover:text-white" href="#genres">TV Shows</a>
            <a className="text-sm text-white/75 hover:text-white" href="#faq">Pricing</a>
          </div>
          <Link href="/login" className="ml-6 grid h-10 w-28 place-items-center rounded-xl lg-glass-indigo text-sm font-semibold text-white">Sign In</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-[820px] flex-col items-center justify-center overflow-hidden px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={artPoster('landing-hero')} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(9,9,11,0.2) 0%, rgba(9,9,11,0.6) 70%, #09090b 100%)' }} />
        <div className="absolute left-1/2 top-[115px] h-[452px] w-[949px] max-w-[95vw] -translate-x-1/2 rounded-full opacity-70 blur-[90px]" style={{ background: 'rgba(214,214,214,0.2)' }} />
        <div className="relative z-10 mt-16">
          <h1 className="font-logo text-5xl font-bold leading-[1.05] sm:text-7xl">All your movies.<br /><span className="text-[#6366f1]">One temple.</span></h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/75 sm:text-lg">Stream thousands of movies and shows in one place.<br className="hidden sm:block" /> No ads. No limits. Just press play.</p>
          <div className="mx-auto mt-9 flex max-w-lg flex-col items-center gap-3 sm:flex-row">
            <input placeholder="Enter your email" className="lg-input h-14 w-full flex-1 rounded-2xl px-5 text-sm text-white placeholder:text-white/50 outline-none" />
            <Link href="/register" className="lg-glass-indigo-35 flex h-14 w-full items-center justify-center rounded-2xl px-6 text-base font-semibold text-white sm:w-44">Get Started&nbsp;&nbsp;→</Link>
          </div>
          <p className="mt-4 text-xs text-white/50">Free 30-day trial&nbsp;&nbsp;•&nbsp;&nbsp;Cancel anytime</p>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-6">
        {/* Trending */}
        <section id="trending" className="pt-16">
          <h2 className="font-logo text-3xl font-semibold">Trending this week</h2>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artPoster(`trend-${n}`)} alt="" className="aspect-[184/246] w-full rounded-2xl object-cover" />
                <span className="font-logo absolute -bottom-6 left-1 text-7xl font-bold text-[#6366f1]" style={{ textShadow: '0 6px 16px rgba(0,0,0,0.6)' }}>{n}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Now streaming */}
        <section className="pt-24">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#6366f1]">NOW STREAMING</p>
          <h2 className="mt-2 font-logo text-3xl font-semibold">The event of the year</h2>
          <div className="relative mt-6 h-[420px] overflow-hidden rounded-3xl bg-[#09090b] shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artPoster('landing-feature')} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.4) 60%, rgba(9,9,11,0) 100%)' }} />
            <div className="relative flex h-full max-w-md flex-col justify-center px-14">
              <h3 className="font-logo text-5xl font-bold">Spiderman</h3>
              <p className="mt-3 text-sm text-white/75">2025&nbsp;&nbsp;•&nbsp;&nbsp;Sci-fi&nbsp;&nbsp;•&nbsp;&nbsp;2h 36m&nbsp;&nbsp;•&nbsp;&nbsp;★ 9.1</p>
              <p className="mt-3 max-w-sm text-base leading-6 text-white/90">Miles Morales swings into the year&apos;s most thrilling multiverse adventure.</p>
              <div className="mt-8 flex gap-4">
                <Link href="/browse" className="lg-glass-indigo-35 flex h-12 w-40 items-center justify-center rounded-xl text-sm font-semibold text-white">▶&nbsp;&nbsp;Watch now</Link>
                <Link href="/browse" className="lg-glass flex h-12 w-36 items-center justify-center rounded-xl text-sm font-semibold text-white">More info</Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-1 gap-8 pt-24 text-center sm:grid-cols-3">
          {STATS.map(([n, l]) => (
            <div key={n}>
              <p className="font-logo text-5xl font-bold text-[#6366f1]">{n}</p>
              <p className="mt-2 text-sm text-white/60">{l}</p>
            </div>
          ))}
        </section>

        {/* Genres */}
        <section id="genres" className="pt-24 text-center">
          <h2 className="font-logo text-3xl font-semibold">Every genre. Every mood.</h2>
          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-3">
            {GENRES.map(([g, hot]) => (
              <span key={g} className={`grid h-10 place-items-center rounded-[20px] px-5 text-sm ${hot ? 'lg-nav-active text-white/90' : 'lg-glass text-white/90'}`}>{g}</span>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="pt-24 text-center">
          <h2 className="font-logo text-3xl font-semibold">Built for movie lovers</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-[20px] lg-glass p-7">
                <span className="grid h-14 w-14 place-items-center rounded-3xl lg-glass-indigo" style={{ background: 'rgba(99,102,241,0.25)' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 3v2M16 3v2" /></svg>
                </span>
                <p className="font-logo mt-6 text-xl font-semibold">{f.title}</p>
                <p className="mt-2 text-sm leading-5 text-white/60">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Screens */}
        <section className="pt-24 text-center">
          <h2 className="font-logo text-3xl font-semibold">On all your screens</h2>
          <div className="mt-8 flex flex-wrap items-end justify-center gap-6 rounded-3xl lg-glass p-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artPoster('screen-tv')} alt="" className="h-[220px] w-[380px] max-w-full rounded-2xl object-cover outline outline-[3px] -outline-offset-[3px] outline-white/25" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artPoster('screen-laptop')} alt="" className="h-[160px] w-[240px] max-w-full rounded-[10px] object-cover outline outline-[3px] -outline-offset-[3px] outline-white/25" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artPoster('screen-phone')} alt="" className="h-[200px] w-[100px] rounded-[20px] object-cover outline outline-[3px] -outline-offset-[3px] outline-white/30" />
          </div>
        </section>

        {/* Testimonials */}
        <section className="pt-24 text-center">
          <h2 className="font-logo text-3xl font-semibold">People can&apos;t stop watching</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <div key={t.who} className="rounded-[20px] lg-glass p-7">
                <p className="text-base text-[#6366f1]">★★★★★</p>
                <p className="mt-4 text-sm leading-6 text-white/90">{t.quote}</p>
                <p className="mt-8 text-xs font-semibold text-white/50">{t.who}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="pt-24 text-center">
          <h2 className="font-logo text-3xl font-semibold">Questions? Answered.</h2>
          <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-3 text-left">
            {FAQ.map((q, i) => (
              <button key={q} onClick={() => setOpen(open === i ? null : i)} className="flex items-center justify-between rounded-2xl lg-glass px-7 py-5">
                <span className="text-base font-semibold text-white/90">{q}</span>
                <span className="font-logo text-2xl font-semibold text-[#6366f1]">{open === i ? '−' : '+'}</span>
              </button>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="pt-24">
          <div className="relative overflow-hidden rounded-3xl bg-[#09090b] p-16 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artPoster('landing-cta')} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-[#0c0c1e]/80" />
            <div className="relative">
              <h2 className="font-logo text-4xl font-bold">Ready to enter the temple?</h2>
              <p className="mt-4 text-base text-white/75">Start your free 30-day trial today. No card required.</p>
              <Link href="/register" className="lg-glass-indigo-35 mx-auto mt-8 flex h-14 w-56 items-center justify-center rounded-2xl text-base font-semibold text-white">Start Watching</Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-24 border-t border-white/10 py-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md cine-grad"><svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7L8 5Z" /></svg></span>
              <span className="font-logo text-lg font-semibold">Cinnetemple</span>
            </div>
            <p className="text-xs text-white/60">About&nbsp;&nbsp;&nbsp;&nbsp;Careers&nbsp;&nbsp;&nbsp;&nbsp;Help Center&nbsp;&nbsp;&nbsp;&nbsp;Terms&nbsp;&nbsp;&nbsp;&nbsp;Privacy</p>
            <p className="text-xs text-white/40">© 2026 Cinnetemple</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
