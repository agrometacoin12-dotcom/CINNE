import { useCallback, useEffect, useState } from 'react';
import { useStudio } from '../lib/app-context';
import type { AdminPurchasesResponse } from '../lib/types';
import { formatDateTime, formatMoney } from '../lib/format';
import { EmptyState, ErrorState, Pager, StatusPill, TableSkeleton } from '../components/ui';

const PAGE = 25;
const STATUSES = ['', 'PAID', 'PENDING', 'FAILED'];

export function PurchasesScreen() {
  const { client } = useStudio();
  const [data, setData] = useState<AdminPurchasesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [skip, setSkip] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    client
      .listPurchases({ q: debounced || undefined, status: status || undefined, take: PAGE, skip })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [client, debounced, status, skip]);

  useEffect(load, [load]);

  return (
    <div>
      <div className="toolbar">
        <input
          className="input search"
          placeholder="Search buyer or title…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSkip(0);
          }}
        />
        <select
          className="select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setSkip(0);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === '' ? 'All statuses' : s}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : data === null ? (
          <TableSkeleton rows={8} cols={7} />
        ) : data.items.length === 0 ? (
          <EmptyState icon="🎟" title="No purchases found" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Buyer</th>
                    <th>Title</th>
                    <th>Amount</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Entitlement</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id} className="static">
                      <td>
                        <strong>{p.userDisplayName ?? '—'}</strong>
                        <div className="muted">{p.userEmail}</div>
                      </td>
                      <td>
                        {p.titleName}
                        {p.isGift ? (
                          <span className="pill info" style={{ marginLeft: 6 }}>
                            gift
                          </span>
                        ) : null}
                      </td>
                      <td>{formatMoney(p.amountMinor, p.currency)}</td>
                      <td className="muted">{p.provider}</td>
                      <td>
                        <StatusPill status={p.status} />
                      </td>
                      <td>
                        {p.entitlementStatus ? (
                          <StatusPill status={p.entitlementStatus} />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="muted">{formatDateTime(p.paidAt ?? p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={data.total} skip={skip} take={PAGE} onPage={setSkip} />
          </>
        )}
      </div>
    </div>
  );
}
