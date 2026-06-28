'use client';

import { forwardRef, useId } from 'react';
import { clsx } from '@/lib/clsx';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, className, id, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        aria-describedby={describedBy}
        className={clsx(
          'glass rounded-glass px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/60',
          'focus:outline-none focus:ring-2 focus:ring-brand/70 transition',
          error && 'ring-2 ring-red-500/70',
          className,
        )}
        {...props}
      />
      {hint && !error && (
        <span id={`${fieldId}-hint`} className="text-xs text-[var(--text-secondary)]">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${fieldId}-error`} className="text-xs text-red-400" role="alert">
          {error}
        </span>
      )}
    </div>
  );
});
