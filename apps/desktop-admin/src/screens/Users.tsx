import { useCallback, useEffect, useState } from 'react';
import { useStudio } from '../lib/app-context';
import type { AdminPurchase, AdminUser, AdminUsersResponse } from '../lib/types';
import { formatDate, formatMoney } from '../lib/format';
import {
  ConfirmModal,
  Drawer,
  EmptyState,
  ErrorState,
  Pager,
  StatusPill,
  TableSkeleton,
} from '../components/ui';

const PAGE = 25;
const ALL_ROLES = ['user', 'moderator', 'admin'];

export function UsersScreen() {
  const { client, toast } = useStudio();
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState<AdminUser | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(() => {
    setError(null);
    setData(null);
    client
      .listUsers(debounced || undefined, PAGE, skip)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [client, debounced, skip]);

  useEffect(load, [load]);

  const patchRow = (u: AdminUser) => {
    setData((d) => (d ? { ...d, users: d.users.map((x) => (x.id === u.id ? u : x)) } : d));
    setSelected(u);
  };

  return (
    <div>
      <div className="toolbar">
        <input
          className="input search"
          placeholder="Search by email or name…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSkip(0);
          }}
        />
      </div>

      <div className="card">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : data === null ? (
          <TableSkeleton rows={8} cols={6} />
        ) : data.users.length === 0 ? (
          <EmptyState icon="👤" title="No members found" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>Verified</th>
                    <th>Tickets</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id} onClick={() => setSelected(u)}>
                      <td>
                        <strong>{u.displayName ?? '—'}</strong>
                        <div className="muted">{u.email}</div>
                      </td>
                      <td>
                        {u.roles.map((r) => (
                          <span
                            key={r}
                            className={`pill ${r === 'admin' ? 'info' : 'neutral'}`}
                            style={{ marginRight: 4 }}
                          >
                            {r}
                          </span>
                        ))}
                      </td>
                      <td>
                        <StatusPill status={u.status} />
                      </td>
                      <td>{u.emailVerified ? '✓' : <span className="muted">—</span>}</td>
                      <td>{u.purchases}</td>
                      <td className="muted">{formatDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={data.total} skip={skip} take={PAGE} onPage={setSkip} />
          </>
        )}
      </div>

      {selected ? (
        <UserDrawer
          user={selected}
          onClose={() => setSelected(null)}
          onUpdated={(u, msg) => {
            patchRow(u);
            toast(msg);
          }}
        />
      ) : null}
    </div>
  );
}

function UserDrawer({
  user,
  onClose,
  onUpdated,
}: {
  user: AdminUser;
  onClose: () => void;
  onUpdated: (u: AdminUser, message: string) => void;
}) {
  const { client, toast } = useStudio();
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [purchases, setPurchases] = useState<AdminPurchase[] | null>(null);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'suspend' | 'activate' | 'verify' | 'roles'>(null);
  const [busy, setBusy] = useState(false);

  const loadPurchases = useCallback(() => {
    setPurchasesError(null);
    setPurchases(null);
    // The admin purchases endpoint filters by q (matches buyer email).
    client
      .listPurchases({ q: user.email, take: 25 })
      .then((r) =>
        setPurchases(r.items.filter((p) => p.userId === user.id || p.userEmail === user.email)),
      )
      .catch((e: unknown) =>
        setPurchasesError(e instanceof Error ? e.message : 'Failed to load purchases'),
      );
  }, [client, user.email, user.id]);

  useEffect(loadPurchases, [loadPurchases]);

  const act = async (kind: 'suspend' | 'activate' | 'verify' | 'roles') => {
    setBusy(true);
    try {
      if (kind === 'roles') {
        const u = await client.setUserRoles(user.id, roles);
        onUpdated(u, 'Roles updated');
      } else if (kind === 'verify') {
        const u = await client.verifyUser(user.id);
        onUpdated(u, 'Email marked verified');
      } else {
        const u = await client.setUserStatus(user.id, kind === 'suspend' ? 'SUSPENDED' : 'ACTIVE');
        onUpdated(u, kind === 'suspend' ? 'Member suspended' : 'Member reactivated');
      }
      setConfirm(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const rolesChanged = JSON.stringify([...roles].sort()) !== JSON.stringify([...user.roles].sort());

  return (
    <Drawer title={user.displayName ?? user.email} onClose={onClose}>
      <div className="row-flex" style={{ marginBottom: 16 }}>
        <StatusPill status={user.status} />
        {user.emailVerified ? (
          <span className="pill published">verified</span>
        ) : (
          <span className="pill draft">unverified</span>
        )}
        <span className="pill neutral">{user.purchases} tickets</span>
      </div>
      <div className="field">
        <label>Email</label>
        <div className="mono" style={{ userSelect: 'text' }}>
          {user.email}
        </div>
      </div>
      <div className="field">
        <label>Member since</label>
        <div>{formatDate(user.createdAt)}</div>
      </div>

      <div className="section-title">Roles</div>
      {ALL_ROLES.map((r) => (
        <label className="checkbox-row" key={r}>
          <input
            type="checkbox"
            checked={roles.includes(r)}
            onChange={(e) =>
              setRoles((cur) => (e.target.checked ? [...cur, r] : cur.filter((x) => x !== r)))
            }
          />
          {r}
        </label>
      ))}
      <button
        className="btn btn-primary btn-sm"
        disabled={!rolesChanged || busy}
        onClick={() => setConfirm('roles')}
      >
        Save roles
      </button>

      <div className="section-title">Actions</div>
      <div className="row-flex" style={{ flexWrap: 'wrap' }}>
        {user.status === 'SUSPENDED' ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirm('activate')}>
            Reactivate
          </button>
        ) : (
          <button className="btn btn-danger btn-sm" onClick={() => setConfirm('suspend')}>
            Suspend
          </button>
        )}
        {!user.emailVerified ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirm('verify')}>
            Mark verified
          </button>
        ) : null}
      </div>

      <div className="section-title">Purchases</div>
      {purchasesError ? (
        <ErrorState message={purchasesError} onRetry={loadPurchases} />
      ) : purchases === null ? (
        <TableSkeleton rows={3} cols={3} />
      ) : purchases.length === 0 ? (
        <div className="muted">No purchases yet.</div>
      ) : (
        <div className="table-wrap card">
          <table className="data">
            <thead>
              <tr>
                <th>Title</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Entitlement</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="static">
                  <td>
                    {p.titleName}
                    {p.isGift ? (
                      <span className="pill info" style={{ marginLeft: 6 }}>
                        gift
                      </span>
                    ) : null}
                  </td>
                  <td>{formatMoney(p.amountMinor, p.currency)}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm ? (
        <ConfirmModal
          title={
            confirm === 'suspend'
              ? 'Suspend this member?'
              : confirm === 'activate'
                ? 'Reactivate this member?'
                : confirm === 'verify'
                  ? 'Mark email as verified?'
                  : 'Update roles?'
          }
          body={
            confirm === 'suspend'
              ? `${user.email} will lose access immediately. Purchases and entitlements are preserved.`
              : confirm === 'activate'
                ? `${user.email} will regain access.`
                : confirm === 'verify'
                  ? `Bypass email verification for ${user.email}.`
                  : `New roles: ${roles.join(', ') || '(none)'}`
          }
          danger={confirm === 'suspend'}
          busy={busy}
          confirmLabel={
            confirm === 'suspend'
              ? 'Suspend'
              : confirm === 'activate'
                ? 'Reactivate'
                : confirm === 'verify'
                  ? 'Verify'
                  : 'Save roles'
          }
          onCancel={() => setConfirm(null)}
          onConfirm={() => void act(confirm)}
        />
      ) : null}
    </Drawer>
  );
}
