'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { TitleSummary } from '@cinnetemple/shared';
import { gradientCss } from '@/lib/poster';

export function PosterCard({
  item,
  width = '100%',
}: {
  item: TitleSummary;
  width?: number | string;
}) {
  const [broken, setBroken] = useState(false);
  const src = item.posterUrl ?? `/art/posters/${item.id}.jpg`;

  return (
    <Link
      href={`/title?id=${item.id}`}
      aria-label={item.title}
      className="group block flex-shrink-0"
      style={{ width }}
    >
      <motion.div
        whileHover={{ scale: 1.06, y: -4 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        className="relative overflow-hidden rounded-lg bg-neutral-900 shadow-lg ring-1 ring-white/5 transition-all duration-200 group-hover:shadow-2xl group-hover:ring-2 group-hover:ring-[#6366f1]"
        style={{ aspectRatio: '2 / 3' }}
      >
        {!broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={item.title}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col justify-between p-3.5" style={{ background: gradientCss(item.id) }}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">CinneTemple</span>
            <div>
              <h3 className="font-readex text-[19px] font-semibold leading-[1.1] text-white drop-shadow-sm">{item.title}</h3>
              {item.genres.length > 0 && (
                <span className="mt-1.5 block text-[11px] text-white/65">{item.genres.slice(0, 2).join(' · ')}</span>
              )}
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent p-2.5 pt-7 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="text-[11px] font-medium text-white/90">{item.year}</span>
          <span className="text-[11px] font-semibold text-white">★ {item.rating.toFixed(1)}</span>
        </div>
      </motion.div>
    </Link>
  );
}
