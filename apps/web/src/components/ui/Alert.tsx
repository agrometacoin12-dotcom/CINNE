'use client';

import { clsx } from '@/lib/clsx';

type Tone = 'error' | 'success' | 'info';

const tones: Record<Tone, string> = {
  error: 'border-red-500/40 text-red-300',
  success: 'border-emerald-500/40 text-emerald-300',
  info: 'border-sky-500/40 text-sky-200',
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={clsx('glass rounded-glass border px-4 py-3 text-sm', tones[tone])}
    >
      {children}
    </div>
  );
}
