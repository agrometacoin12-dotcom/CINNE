import { useEffect, useState } from 'react';
import { useStudio } from '../lib/app-context';
import type { UploadItem } from '../lib/uploads';
import { formatBytes, formatSpeed } from '../lib/format';

/** Bottom-right global upload tray with per-item progress/cancel/retry. */
export function UploadTray() {
  const { uploads } = useStudio();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => uploads.subscribe(setItems), [uploads]);

  if (items.length === 0) return null;

  const active = items.filter((i) => i.status === 'uploading' || i.status === 'queued').length;

  return (
    <div className="upload-tray">
      <div className="tray-head">
        <span>Uploads {active > 0 ? <span className="muted">({active} active)</span> : null}</span>
        <div className="row-flex">
          <button className="icon-btn" onClick={() => uploads.clearFinished()}>
            Clear
          </button>
          <button className="icon-btn" onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? '▴' : '▾'}
          </button>
        </div>
      </div>
      {!collapsed ? (
        <div className="items">
          {items.map((item) => (
            <div className="upload-item" key={item.id}>
              <div className="row">
                <div style={{ minWidth: 0 }}>
                  <div className="name" title={item.fileName}>
                    {item.label}
                  </div>
                  <div className="meta">
                    {item.status === 'uploading'
                      ? `${Math.round(item.progress * 100)}% · ${formatBytes(item.bytesSent)} / ${formatBytes(item.fileSize)} · ${formatSpeed(item.speedBps)}`
                      : item.status === 'done'
                        ? `Done · ${formatBytes(item.fileSize)}`
                        : item.status === 'error'
                          ? (item.error ?? 'Failed')
                          : item.status === 'cancelled'
                            ? 'Cancelled'
                            : 'Waiting…'}
                  </div>
                </div>
                <div className="row-flex" style={{ flex: 'none' }}>
                  {item.status === 'uploading' || item.status === 'queued' ? (
                    <button className="icon-btn" onClick={() => uploads.cancel(item.id)}>
                      Cancel
                    </button>
                  ) : item.status === 'error' || item.status === 'cancelled' ? (
                    <>
                      <button className="icon-btn" onClick={() => uploads.retry(item.id)}>
                        Retry
                      </button>
                      <button className="icon-btn" onClick={() => uploads.dismiss(item.id)}>
                        ✕
                      </button>
                    </>
                  ) : (
                    <button className="icon-btn" onClick={() => uploads.dismiss(item.id)}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div
                className={`progress${item.status === 'done' ? ' done' : item.status === 'error' ? ' error' : ''}`}
              >
                <div style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Toasts() {
  const { toasts } = useStudio();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.tone === 'success' ? '✓' : t.tone === 'error' ? '✕' : 'ℹ'} {t.message}
        </div>
      ))}
    </div>
  );
}
