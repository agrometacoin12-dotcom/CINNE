'use client';

import { useEffect } from 'react';

/**
 * Shared Studio (admin console) primitives in the indigo liquid-glass language
 * (#090b12 · #6c6ffc · lg-glass insets): pills, status pills, a confirm modal
 * and small building blocks reused across the Movies / Members / Sales /
 * Activity surfaces.
 */

export type PillTone = 'neutral' | 'live' | 'draft' | 'indigo' | 'ok' | 'danger';

const PILL_TONES: Record<PillTone, string> = {
  neutral: 'bg-white/10 text-white/70',
  live: 'bg-red-500/20 text-red-300',
  draft: 'bg-amber-500/20 text-amber-300',
  indigo: 'bg-[#6c6ffc]/20 text-[#8082ff]',
  ok: 'bg-emerald-500/20 text-emerald-300',
  danger: 'bg-red-500/20 text-red-300',
};

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: PillTone;
}) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Map a user account status to a pill tone. */
export function userStatusTone(status: string): PillTone {
  return status.toUpperCase() === 'SUSPENDED' ? 'danger' : 'ok';
}

/** Map a purchase status to a pill tone. */
export function purchaseStatusTone(status: string): PillTone {
  switch (status.toUpperCase()) {
    case 'PAID':
      return 'ok';
    case 'PENDING':
      return 'draft';
    case 'FAILED':
      return 'danger';
    case 'REFUNDED':
      return 'indigo';
    default:
      return 'neutral';
  }
}

/** Map an entitlement status to a pill tone. */
export function entitlementStatusTone(status: string | null | undefined): PillTone {
  switch ((status ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'ok';
    case 'CONSUMED':
      return 'neutral';
    case 'EXPIRED':
      return 'draft';
    case 'REVOKED':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Inline error banner in the console's red glass style. */
export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[12px] border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
      {children}
    </p>
  );
}

/** A glass "Load more" affordance that reports the total count. */
export function LoadMore({
  shown,
  total,
  loading,
  onClick,
}: {
  shown: number;
  total: number;
  loading: boolean;
  onClick: () => void;
}) {
  if (shown >= total) {
    return (
      <p className="py-3 text-center text-[11.5px] text-white/40">
        {total > 0 ? `Showing all ${total}` : null}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      <button
        onClick={onClick}
        disabled={loading}
        className="lg-glass h-10 rounded-[11px] px-6 text-[12.5px] font-semibold text-white disabled:opacity-50"
        style={{ background: 'rgba(214,214,214,0.08)' }}
      >
        {loading ? 'Loading…' : 'Load more'}
      </button>
      <span className="text-[11px] text-white/40">
        Showing {shown} of {total}
      </span>
    </div>
  );
}

/**
 * Accessible confirm modal. Renders nothing when closed. The confirm button
 * shows a busy state and can be tinted for destructive actions.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgba(4,5,10,0.66)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="lg-glass w-full max-w-md rounded-[18px] p-6"
        style={{ background: 'rgba(20,22,32,0.92)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-readex text-lg font-semibold text-white">{title}</h3>
        <div className="mt-2 text-sm leading-relaxed text-white/65">{body}</div>
        {error && (
          <p className="mt-4 rounded-[10px] border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="lg-glass h-10 rounded-[11px] px-5 text-[13px] font-semibold text-white/80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="h-10 rounded-[11px] px-5 text-[13px] font-semibold text-white disabled:opacity-60"
            style={{ background: danger ? 'rgba(239,68,68,0.85)' : 'rgba(99,102,241,0.85)' }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
