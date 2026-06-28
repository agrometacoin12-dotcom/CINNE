'use client';

import { motion } from 'framer-motion';

/**
 * Slowly drifting cinematic backdrop with brand-tinted aurora blobs behind a
 * dark scrim. Sits fixed behind all content so glass surfaces have something
 * rich to refract.
 */
export function CinematicBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-bg-base">
      <motion.div
        className="absolute -left-1/4 -top-1/4 h-[60vmax] w-[60vmax] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(229,9,20,0.35), transparent 60%)' }}
        animate={{ x: [0, 80, -40, 0], y: [0, -60, 40, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-[-15%] top-[10%] h-[50vmax] w-[50vmax] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(120,40,200,0.30), transparent 60%)' }}
        animate={{ x: [0, -60, 30, 0], y: [0, 50, -30, 0] }}
        transition={{ duration: 34, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-20%] left-[20%] h-[45vmax] w-[45vmax] rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(0,120,160,0.28), transparent 60%)' }}
        animate={{ x: [0, 50, -50, 0], y: [0, -40, 20, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[2px]" />
    </div>
  );
}
