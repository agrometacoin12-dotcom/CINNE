'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, formatPrice } from '@/lib/api';
import { entitlementStatusTone, ErrorNote, LoadMore, Pill, purchaseStatusTone } from './ui';

/**
 * Sales — a read-only purchases ledger. Search + status filter + optional
 * title filter (deep-linked from a movie row), load-more pagination against
 * the real total. Amount is rendered with formatPrice(amountMinor,currency).
 *
 * The purchases response type isn't published in @cinnetemple/shared yet, so
 * we describe the documented contract shape locally.
 */
interface PurchaseRow {
  id: string;
  userEmail: string;
  userDisplayName: string | null;
  titleName: string;
  amountMinor: number;
  currency: string;
  provider: string;
  status: string;
  entitlementStatus: string | null;
  createdAt: string;
  paidAt: string | null;
}
interface PurchasesResponse {
  total: number;
  items: PurchaseRow[];
}

const PAGE = 40;
const STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;

export function SalesTab({
  titleId,
  titleLabel,
  onClearTitle,
}: {
  titleId?: string;
  titleLabel?: string;
  onClearTitle: () => void;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    (skip: number): Promise<PurchasesResponse> =>
      api.adminPurchases({
        q: query.trim() || undefined,
        titleId: titleId || undefined,
        status: status || undefined,
        take: PAGE,
        skip,
      }) as unknown as Promise<PurchasesResponse>,
    [query, status, titleId],
  );

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      fetchPage(0)
        .then((r) => {
          setRows(r.items);
          setTotal(r.total);
          setError(null);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load sales'))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    fetchPage(rows.length)
      .then((r) => {
        setRows((prev) => [...prev, ...r.items]);
        setTotal(r.total);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load more sales'))
      .finally(() => setLoadingMore(false));
  }, [fetchPage, rows.length]);

  return (
    <div className="grid gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="lg-glass flex h-[46px] w-full max-w-[320px] items-center gap-2.5 rounded-[12px] px-4"
          style={{ background: 'rgba(214,214,214,0.07)' }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="text-white/50"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search buyer or title…"
            className="w-full bg-transparent text-[13.5px] text-white outline-none placeholder:text-white/45"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="lg-input h-[46px] appearance-none rounded-[12px] px-4 text-[13.5px] text-white outline-none"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        {titleId && (
          <button
            onClick={onClearTitle}
            className="lg-glass flex h-[46px] items-center gap-2 rounded-[12px] px-4 text-[12.5px] font-semibold text-[#8082ff]"
            style={{ background: 'rgba(99,102,241,0.16)' }}
          >
            <span className="max-w-[180px] truncate">
              Title: {titleLabel ?? titleId.slice(0, 8)}
            </span>
            <span className="text-white/70">✕</span>
          </button>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Ledger table */}
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[1.6fr_1.4fr_0.9fr_0.8fr_0.9fr_0.9fr_1fr] gap-3 px-4 pb-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">
            <span>Buyer</span>
            <span>Title</span>
            <span className="text-right">Amount</span>
            <span>Provider</span>
            <span>Status</span>
            <span>Entitlement</span>
            <span className="text-right">Date</span>
          </div>
          <div className="grid gap-2">
            {rows.map((p) => (
              <div
                key={p.id}
                className="lg-glass grid grid-cols-[1.6fr_1.4fr_0.9fr_0.8fr_0.9fr_0.9fr_1fr] items-center gap-3 rounded-[12px] px-4 py-3"
                style={{ background: 'rgba(214,214,214,0.06)' }}
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-white">
                    {p.userDisplayName ?? '—'}
                  </p>
                  <p className="truncate text-[11px] text-white/45">{p.userEmail}</p>
                </div>
                <span className="truncate text-[13px] text-white/85">{p.titleName}</span>
                <span className="text-right text-[13px] font-semibold tabular-nums text-white">
                  {formatPrice(p.amountMinor, p.currency)}
                </span>
                <span className="truncate text-[12px] capitalize text-white/60">{p.provider}</span>
                <span>
                  <Pill tone={purchaseStatusTone(p.status)}>{p.status.toLowerCase()}</Pill>
                </span>
                <span>
                  {p.entitlementStatus ? (
                    <Pill tone={entitlementStatusTone(p.entitlementStatus)}>
                      {p.entitlementStatus.toLowerCase()}
                    </Pill>
                  ) : (
                    <span className="text-[12px] text-white/35">—</span>
                  )}
                </span>
                <span className="text-right text-[11.5px] tabular-nums text-white/55">
                  {new Date(p.paidAt ?? p.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && rows.length === 0 && (
        <div className="grid place-items-center py-10">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        </div>
      )}
      {!loading && rows.length === 0 && !error && (
        <p className="py-10 text-center text-sm text-white/50">No purchases match these filters.</p>
      )}

      {rows.length > 0 && (
        <LoadMore shown={rows.length} total={total} loading={loadingMore} onClick={loadMore} />
      )}
    </div>
  );
}
