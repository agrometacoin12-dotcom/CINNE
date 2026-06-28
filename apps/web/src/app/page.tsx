'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';

const features = [
  {
    title: 'Cinematic discovery',
    body: 'A living, glassy interface that surfaces what to watch next — beautifully.',
    icon: '🎬',
  },
  {
    title: 'Your library, everywhere',
    body: 'Watchlists and progress sync instantly across web and iOS, online or off.',
    icon: '📲',
  },
  {
    title: 'Private by design',
    body: 'Passkeys, biometric login, and MFA. Your account, locked down by default.',
    icon: '🔐',
  },
];

const rows = ['Trending', 'New releases', 'Critically acclaimed', 'Because you watched'];

export default function LandingPage() {
  return (
    <>
      <GlassNav />

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="glass inline-block rounded-pill px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
            Now in early access
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl">
            Your cinema, <span className="text-gradient">reimagined</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-[var(--text-secondary)]">
            Discover, save, and watch in a premium experience crafted with liquid
            glass and obsessive attention to detail.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/register">
              <Button variant="primary" className="px-7 py-3.5 text-base">
                Get started — free
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="glass" className="px-7 py-3.5 text-base">
                Sign in
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Faux content rows to set the Netflix-style tone */}
        <div className="mt-16 space-y-6 text-left">
          {rows.map((row, r) => (
            <motion.div
              key={row}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: r * 0.05 }}
            >
              <h2 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">{row}</h2>
              <div className="carousel-fade flex gap-3 overflow-x-auto pb-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <motion.div
                    key={i}
                    whileHover={{ scale: 1.06, y: -6 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                    className="movie-card-glass aspect-[2/3] w-28 flex-shrink-0 bg-white/[0.04] backdrop-blur-xl sm:w-36"
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 pb-24">
        <div className="grid gap-5 sm:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <GlassPanel className="h-full p-6">
                <div className="text-3xl">{f.icon}</div>
                <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{f.body}</p>
              </GlassPanel>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/5 px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
        © {new Date().getFullYear()} CinneTemple. Crafted with liquid glass.
      </footer>
    </>
  );
}
