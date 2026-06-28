'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import { clsx } from '@/lib/clsx';

type GlassPanelProps = HTMLMotionProps<'div'> & {
  strong?: boolean;
};

/** A frosted translucent surface — the core Liquid Glass building block. */
export function GlassPanel({ strong, className, children, ...props }: GlassPanelProps) {
  return (
    <motion.div
      className={clsx('glass rounded-glass', strong && 'glass-strong', className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
