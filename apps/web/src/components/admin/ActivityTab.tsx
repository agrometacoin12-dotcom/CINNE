'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ErrorNote, LoadMore, Pill } from './ui';

/**
 * Activity — the admin audit feed: who did what, when, with expandable
 * metadata. Read-only, load-more paginated against the real total.
 *
 * The audit response type isn't published in @cinnetemple/shared yet, so the
 * documented contract shape is described locally.
 */
interface AuditRow {
  id: string;
  actorEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
}
interface AuditResponse {
  total: number;
  items: AuditRow[];
}

const PAGE = 50;

function AuditItem({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const hasMeta = row.metadata != null && Object.keys(row.metadata as object).length > 0;
  return (
    <div
      className="lg-glass rounded-[14px] px-4 py-3"
      style={{ background: 'rgba(214,214,214,0.06)' }}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <Pill tone="indigo">{row.action}</Pill>
        {row.entity && (
          <span className="text-[12.5px] text-white/60">
            {row.entity}
            {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}
          </span>
        )}
        <span className="text-[12.5px] font-semibold text-white/80">
          {row.actorEmail ?? 'system'}
        </span>
        <span className="ml-auto text-[11.5px] tabular-nums text-white/45">
          {new Date(row.createdAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      {(hasMeta || row.ip) && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-1.5 text-[11.5px] font-semibold text-[#8082ff]"
        >
          {open ? 'Hide details' : 'Details'}
        </button>
      )}
      {open && (
        <div className="mt-2 grid gap-2">
          {row.ip && <p className="text-[11.5px] text-white/45">IP · {row.ip}</p>}
          {hasMeta && (
            <pre className="overflow-x-auto rounded-[10px] bg-[#090b12] px-3 py-2.5 text-[11.5px] leading-relaxed text-white/70">
              {JSON.stringify(row.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ActivityTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    (api.adminAudit(PAGE, 0) as unknown as Promise<AuditResponse>)
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load activity'))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    (api.adminAudit(PAGE, rows.length) as unknown as Promise<AuditResponse>)
      .then((r) => {
        setRows((prev) => [...prev, ...r.items]);
        setTotal(r.total);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load more activity'))
      .finally(() => setLoadingMore(false));
  }, [rows.length]);

  return (
    <div className="grid gap-4">
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-2.5">
        {rows.map((r) => (
          <AuditItem key={r.id} row={r} />
        ))}
      </div>

      {loading && rows.length === 0 && (
        <div className="grid place-items-center py-10">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        </div>
      )}
      {!loading && rows.length === 0 && !error && (
        <p className="py-10 text-center text-sm text-white/50">No activity recorded yet.</p>
      )}

      {rows.length > 0 && (
        <LoadMore shown={rows.length} total={total} loading={loadingMore} onClick={loadMore} />
      )}
    </div>
  );
}
