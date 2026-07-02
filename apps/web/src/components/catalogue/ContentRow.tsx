'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
import type { BrowseRow } from '@cinnetemple/shared';
import { PosterCard } from './PosterCard';

export function ContentRow({ row, index = 0 }: { row: BrowseRow; index?: number }) {
  const scroller = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * (el.clientWidth * 0.85), behavior: 'smooth' });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4, delay: Math.min(index, 4) * 0.04 }}
      className="group/row relative"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight text-white">{row.title}</h2>
        <span className="cursor-pointer text-sm font-medium text-[#8082ff] hover:underline">See all</span>
      </div>

      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollBy(-1)}
        className="absolute -left-2 top-[calc(50%+14px)] z-10 hidden h-24 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl text-white opacity-0 backdrop-blur transition-opacity group-hover/row:opacity-100 sm:flex"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollBy(1)}
        className="absolute -right-2 top-[calc(50%+14px)] z-10 hidden h-24 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl text-white opacity-0 backdrop-blur transition-opacity group-hover/row:opacity-100 sm:flex"
      >
        ›
      </button>

      <div
        ref={scroller}
        className="flex gap-3 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {row.items.map((item) => (
          <PosterCard key={item.id} item={item} width={150} />
        ))}
      </div>
    </motion.section>
  );
}
