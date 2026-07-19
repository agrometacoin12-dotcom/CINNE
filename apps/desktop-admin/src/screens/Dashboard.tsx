import { useCallback, useEffect, useState } from 'react';
import { useStudio } from '../lib/app-context';
import type { AdminAuditEntry, AdminStats } from '../lib/types';
import { formatDateTime, formatMoney } from '../lib/format';
import { ErrorState, TableSkeleton } from '../components/ui';

export function DashboardScreen() {
  const { client } = useStudio();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setStats(null);
    setAudit(null);
    Promise.all([client.stats(), client.listAudit(8, 0)])
      .then(([s, a]) => {
        setStats(s);
        setAudit(a.items);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [client]);

  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <div className="stat-grid">
        {stats ? (
          <>
            <div className="card stat-card">
              <div className="label">Members</div>
              <div className="value">{stats.users.toLocaleString()}</div>
            </div>
            <div className="card stat-card">
              <div className="label">Titles</div>
              <div className="value">
                {stats.titles.toLocaleString()}{' '}
                <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                  · {stats.published} live
                </span>
              </div>
            </div>
            <div className="card stat-card">
              <div className="label">Tickets sold</div>
              <div className="value">{stats.purchases.toLocaleString()}</div>
            </div>
            <div className="card stat-card">
              <div className="label">Active entitlements</div>
              <div className="value">{stats.activeEntitlements.toLocaleString()}</div>
            </div>
            {stats.revenue.map((r) => (
              <div className="card stat-card" key={r.currency}>
                <div className="label">Revenue ({r.currency})</div>
                <div className="value accent">{formatMoney(r.totalMinor, r.currency)}</div>
              </div>
            ))}
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => (
            <div className="card stat-card" key={i}>
              <div className="skel" style={{ height: 13, width: 90 }} />
              <div className="skel" style={{ height: 28, width: 120, marginTop: 10 }} />
            </div>
          ))
        )}
      </div>

      <div className="section-title">Recent activity</div>
      <div className="card">
        {audit === null ? (
          <TableSkeleton rows={5} cols={4} />
        ) : audit.length === 0 ? (
          <div className="state-block">
            <h3>No audit entries yet</h3>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Entity</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((entry) => (
                  <tr key={entry.id} className="static">
                    <td>
                      <span className="pill info">{entry.action}</span>
                    </td>
                    <td>{entry.actorEmail ?? '—'}</td>
                    <td className="muted">{entry.entity ?? '—'}</td>
                    <td className="muted">{formatDateTime(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
