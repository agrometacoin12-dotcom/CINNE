'use client';

import { motion } from 'framer-motion';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Authentication layout: a vivid Liquid Glass experience — a bright animated
 * aurora behind a light frosted card with the serif CinneTemple wordmark.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <AuroraBackground />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        <div className="auth-scope auth-card rounded-[28px] px-8 py-9">
          <div className="text-center">
            <div className="wordmark text-[40px] leading-none">
              <span style={{ color: '#16161a' }}>Cinne</span>
              <span style={{ color: '#E50914' }}>Temple</span>
            </div>
            {subtitle && (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{subtitle}</p>
            )}
          </div>

          <h1 className="sr-only">{title}</h1>
          <div className="mt-7">{children}</div>
        </div>

        {footer && (
          <p className="mt-5 text-center text-sm text-white/90 drop-shadow">{footer}</p>
        )}
      </motion.div>
    </main>
  );
}

/** Bright, slowly drifting aurora — the signature auth backdrop. */
function AuroraBackground() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <div className="absolute inset-0" style={{ background: '#dfe1ea' }} />
      <motion.div
        className="absolute -left-24 -top-24 h-[42vw] w-[42vw] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, #ff2d78, transparent 65%)' }}
        animate={{ x: [0, 60, -20, 0], y: [0, 40, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-[-10%] top-[-8%] h-[44vw] w-[44vw] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, #3b5bff, transparent 65%)' }}
        animate={{ x: [0, -50, 30, 0], y: [0, 50, -20, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-15%] left-[10%] h-[40vw] w-[40vw] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, #22d3ee, transparent 65%)' }}
        animate={{ x: [0, 40, -40, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-10%] right-[8%] h-[38vw] w-[38vw] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, #7b2ff7, transparent 65%)' }}
        animate={{ x: [0, -30, 30, 0], y: [0, 30, -30, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}
