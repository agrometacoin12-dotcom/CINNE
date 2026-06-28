'use client';

import { forwardRef } from 'react';
import { clsx } from '@/lib/clsx';

type Variant = 'primary' | 'glass' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold ' +
  'transition-all duration-200 ease-glass disabled:opacity-50 disabled:cursor-not-allowed ' +
  'active:scale-[0.98]';

const variants: Record<Variant, string> = {
  primary: 'btn-glossy hover:brightness-[1.06]',
  glass: 'glass text-[var(--text-primary)] hover:brightness-125',
  ghost: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading, fullWidth, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(base, variants[variant], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      )}
      {children}
    </button>
  );
});
