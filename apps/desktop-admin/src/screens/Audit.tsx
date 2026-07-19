import { Fragment, useCallback, useEffect, useState } from 'react';
import { useStudio } from '../lib/app-context';
import type { AdminAuditResponse } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { EmptyState, ErrorState, Pager, TableSkeleton } from '../components/ui';

const PAGE = 30;

export function AuditScreen() {
  const { client } = useStudio();
  const [data, setData] = useState<AdminAuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    client
      .listAudit(PAGE, skip)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [client, skip]);

  useEffect(load, [load]);

  return (
    <div className="card">
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : data === null ? (
        <TableSkeleton rows={10} cols={5} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="📜" title="No audit entries" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>IP</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                      <td>{entry.actorEmail ?? <span className="muted">system</span>}</td>
                      <td>
                        <span className="pill info">{entry.action}</span>
                      </td>
                      <td className="muted">
                        {entry.entity ?? '—'}
                        {entry.entityId ? (
                          <span className="mono" style={{ marginLeft: 6, fontSize: 11 }}>
                            {entry.entityId.slice(0, 8)}…
                          </span>
                        ) : null}
                      </td>
                      <td className="muted mono">{entry.ip ?? '—'}</td>
                      <td className="muted">{formatDateTime(entry.createdAt)}</td>
                    </tr>
                    {expanded === entry.id ? (
                      <tr className="static">
                        <td colSpan={5}>
                          <pre className="json-view mono" style={{ margin: 0 }}>
                            {JSON.stringify(entry.metadata ?? {}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={data.total} skip={skip} take={PAGE} onPage={setSkip} />
        </>
      )}
    </div>
  );
}
