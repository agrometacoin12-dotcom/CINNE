'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Title } from '@cinnetemple/shared';
import { gradientCss } from '@/lib/poster';

export function Hero({ title }: { title: Title }) {
  const [broken, setBroken] = useState(false);
  const bg = title.heroUrl ?? `/art/hero/${title.id}.jpg`;
  const meta = [
    String(title.year),
    title.genres[0],
    title.runtimeMinutes ? `${Math.floor(title.runtimeMinutes / 60)}h ${title.runtimeMinutes % 60}m` : null,
    title.maturityRating,
  ].filter(Boolean);

  return (
    <section className="relative h-[60vh] min-h-[440px] w-full overflow-hidden rounded-2xl border border-white/[0.06]">
      {!broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg} alt={title.title} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: gradientCss(title.id) }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f] via-[#0a0a0f]/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#0a0a0f]/95 to-transparent" />

      <div className="relative flex h-full max-w-2xl flex-col justify-end p-6 sm:p-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#8082ff]">Featured</span>
          <h1 className="mt-2 font-readex text-4xl font-bold leading-[0.98] tracking-tight text-white drop-shadow-lg sm:text-6xl">
            {title.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-[#9ca3af]">
            {meta.map((m, i) => (
              <span key={i} className="flex items-center gap-2.5">
                {i > 0 && <span className="text-white/25">•</span>}
                {m}
              </span>
            ))}
            {title.rating > 0 && (
              <span className="flex items-center gap-2.5">
                <span className="text-white/25">•</span>
                <span className="flex items-center gap-1 text-white"><span className="text-[#fbbf24]">★</span>{title.rating.toFixed(1)}</span>
              </span>
            )}
          </div>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-[#9ca3af] line-clamp-3">{title.overview}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={`/title?id=${title.id}`} className="flex items-center gap-2.5 rounded-full bg-gradient-to-br from-[#6c6ffc] to-[#4f46e5] px-6 py-2.5 text-[15px] font-semibold text-white shadow-lg shadow-[#4f46e5]/40 transition hover:brightness-110">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg>
              Play now
            </Link>
            <Link href={`/title?id=${title.id}`} className="flex items-center gap-2.5 rounded-full border border-white/15 bg-[#1a1a22] px-6 py-2.5 text-[15px] font-semibold text-white transition hover:bg-[#22222c]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              More info
            </Link>
          </div>

          <div className="mt-7 flex gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === 0 ? 'w-6 bg-[#8082ff]' : 'w-1.5 bg-white/20'}`} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
