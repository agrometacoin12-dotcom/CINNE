'use client';

import { motion } from 'framer-motion';
import type { BrowseRow } from '@cinnetemple/shared';
import { PosterCard } from './PosterCard';

export function ContentRow({ row, index = 0 }: { row: BrowseRow; index?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, x: -16 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="space-y-3"
    >
      <h2 className="px-4 text-lg font-bold text-[var(--text-primary)] sm:px-6">
        {row.title}
      </h2>
      <div className="carousel-fade flex gap-4 overflow-x-auto px-4 pb-3 sm:px-6">
        {row.items.map((item) => (
          <PosterCard key={item.id} item={item} width={210} />
        ))}
      </div>
    </motion.section>
  );
}
