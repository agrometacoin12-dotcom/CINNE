import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Right-hand slide-in drawer. */
export function Drawer({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className={`drawer${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </aside>
    </>
  );
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

/** Destructive confirmation modal; optionally requires typing a phrase. */
export function ConfirmModal({
  title,
  body,
  confirmLabel = 'Confirm',
  typedPhrase,
  danger = true,
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  /** When set, the user must type this exactly to enable the confirm button. */
  typedPhrase?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const ok = !typedPhrase || typed === typedPhrase;
  return (
    <Modal onClose={onCancel}>
      <h3>{title}</h3>
      <p>{body}</p>
      {typedPhrase ? (
        <div className="field">
          <label>
            Type <span className="mono">{typedPhrase}</span> to confirm
          </label>
          <input
            className="input"
            style={{ width: '100%' }}
            value={typed}
            autoFocus
            onChange={(e) => setTyped(e.target.value)}
            placeholder={typedPhrase}
          />
        </div>
      ) : null}
      <div className="actions">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
          disabled={!ok || busy}
          onClick={onConfirm}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === 'published' || s === 'active' || s === 'paid'
      ? s === 'published'
        ? 'published'
        : 'published'
      : s === 'draft' || s === 'pending'
        ? 'draft'
        : s === 'suspended' || s === 'failed' || s === 'revoked'
          ? 'danger'
          : s === 'consumed'
            ? 'info'
            : 'neutral';
  return <span className={`pill ${cls}`}>{status}</span>;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: 14 }}>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={c}
              className="skel"
              style={{ height: 16, flex: c === 1 ? 2 : 1, animationDelay: `${(r + c) * 60}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon = '🎬',
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-block">
      <div className="icon">{icon}</div>
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state-block">
      <div className="icon">⚠️</div>
      <h3>Something went wrong</h3>
      <p>{message}</p>
      <button className="btn btn-ghost btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function Pager({
  total,
  skip,
  take,
  onPage,
}: {
  total: number;
  skip: number;
  take: number;
  onPage: (skip: number) => void;
}) {
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + take, total);
  return (
    <div className="pager">
      <span>
        {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="btns">
        <button
          className="btn btn-ghost btn-sm"
          disabled={skip === 0}
          onClick={() => onPage(Math.max(0, skip - take))}
        >
          ← Prev
        </button>
        <button
          className="btn btn-ghost btn-sm"
          disabled={skip + take >= total}
          onClick={() => onPage(skip + take)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/** Hidden-input file picker rendered as a button. */
export function FileButton({
  accept,
  label,
  className = 'btn btn-ghost btn-sm',
  disabled,
  onFile,
}: {
  accept: string;
  label: ReactNode;
  className?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <button className={className} disabled={disabled} onClick={() => ref.current?.click()}>
        {label}
      </button>
    </>
  );
}

/** Poster thumbnail with graceful empty fallback. */
export function PosterThumb({ url, title }: { url: string | null; title: string }) {
  if (!url) return <div className="poster-thumb empty">No art</div>;
  return <img className="poster-thumb" src={url} alt={title} />;
}
