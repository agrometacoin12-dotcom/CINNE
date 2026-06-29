'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Title } from '@cinnetemple/shared';
import { Button } from '@/components/ui/Button';

export function Hero({ title }: { title: Title }) {
  return (
    <motion.section
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-4 overflow-hidden rounded-glass border border-white/10 sm:mx-6"
      style={{ minHeight: 360 }}
    >
      {title.heroUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={title.heroUrl} alt={title.title} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(120deg, #1a1030, #3a1020 60%, #0a0a0b)' }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      <div className="relative flex h-full flex-col justify-end gap-3 p-6 sm:p-10" style={{ minHeight: 360 }}>
        {title.tagline && (
          <span className="text-sm font-medium uppercase tracking-widest text-[var(--text-secondary)]">
            {title.tagline}
          </span>
        )}
        <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          {title.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span>{title.year}</span>
          <span>★ {title.rating.toFixed(1)}</span>
          {title.maturityRating && (
            <span className="glass rounded px-2 py-0.5 text-xs">{title.maturityRating}</span>
          )}
          <span>{title.genres.slice(0, 3).join(' · ')}</span>
        </div>
        <p className="max-w-xl text-sm text-[var(--text-primary)]/90 line-clamp-3">
          {title.overview}
        </p>
        <div className="mt-2 flex gap-3">
          <Button variant="primary">▶ Play</Button>
          <Link href={`/title?id=${title.id}`}>
            <Button variant="glass">More info</Button>
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
