'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import type { TitleSummary } from '@cinnetemple/shared';

export function PosterCard({
  item,
  width = '100%',
}: {
  item: TitleSummary;
  width?: number | string;
}) {
  return (
    <Link href={`/title/${item.id}`} aria-label={item.title}>
      <motion.div
        whileHover={{ scale: 1.07, y: -6 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        className="movie-card-glass group relative flex-shrink-0"
        style={{ width, aspectRatio: '2 / 3' }}
      >
        {item.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.posterUrl} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-end bg-white/[0.04] p-3 backdrop-blur-xl">
            <span className="text-sm font-semibold leading-tight text-white/90 drop-shadow">
              {item.title}
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-xs text-white">{item.year}</span>
          <span className="text-xs font-semibold text-white">★ {item.rating.toFixed(1)}</span>
        </div>
      </motion.div>
    </Link>
  );
}
