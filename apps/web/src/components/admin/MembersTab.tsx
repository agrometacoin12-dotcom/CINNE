'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminUser } from '@cinnetemple/shared';
import { api, ApiError } from '@/lib/api';
import { ConfirmDialog, ErrorNote, LoadMore, Pill, userStatusTone } from './ui';

/**
 * Members management surface: live search, load-more pagination against the
 * real total, and a per-row action menu (promote / demote / suspend /
 * reactivate / force-verify). Actions confirm, hit the API, optimistically
 * replace the row, and surface errors inline.
 */

const PAGE = 50;

type ActionKind = 'promote' | 'demote' | 'suspend' | 'reactivate' | 'verify';

interface PendingAction {
  kind: ActionKind;
  user: AdminUser;
}

const ACTION_COPY: Record<
  ActionKind,
  { title: string; confirm: string; danger?: boolean; body: (u: AdminUser) => string }
> = {
  promote: {
    title: 'Promote to admin',
    confirm: 'Promote',
    body: (u) => `Grant ${u.displayName ?? u.email} full Studio admin access?`,
  },
  demote: {
    title: 'Remove admin access',
    confirm: 'Demote',
    danger: true,
    body: (u) => `Revoke admin access for ${u.displayName ?? u.email}? They keep member access.`,
  },
  suspend: {
    title: 'Suspend member',
    confirm: 'Suspend',
    danger: true,
    body: (u) =>
      `Suspend ${u.displayName ?? u.email}? They will be blocked from signing in until reactivated.`,
  },
  reactivate: {
    title: 'Reactivate member',
    confirm: 'Reactivate',
    body: (u) => `Restore access for ${u.displayName ?? u.email}?`,
  },
  verify: {
    title: 'Force-verify email',
    confirm: 'Verify',
    body: (u) => `Mark ${u.email} as verified without the email confirmation step?`,
  },
};

function initialsOf(u: AdminUser) {
  return (u.displayName ?? u.email)
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function ActionMenu({
  user,
  isSelf,
  onAction,
}: {
  user: AdminUser;
  isSelf: boolean;
  onAction: (kind: ActionKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const isAdmin = user.roles.includes('admin');
  const suspended = user.status.toUpperCase() === 'SUSPENDED';

  const items: { kind: ActionKind; label: string; danger?: boolean }[] = [];
  if (isAdmin) {
    // Backend 403s self-demotion — hide it for the signed-in admin.
    if (!isSelf) items.push({ kind: 'demote', label: 'Remove admin', danger: true });
  } else {
    items.push({ kind: 'promote', label: 'Promote to admin' });
  }
  if (suspended) items.push({ kind: 'reactivate', label: 'Reactivate' });
  else items.push({ kind: 'suspend', label: 'Suspend', danger: true });
  if (!user.emailVerified) items.push({ kind: 'verify', label: 'Force-verify email' });

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Member actions"
        className="lg-glass grid h-9 w-9 place-items-center rounded-[10px] text-white"
        style={{ background: 'rgba(214,214,214,0.08)' }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div
          className="lg-glass absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-[12px] p-1.5"
          style={{ background: 'rgba(20,22,32,0.97)' }}
        >
          {items.map((it) => (
            <button
              key={it.kind}
              onClick={() => {
                setOpen(false);
                onAction(it.kind);
              }}
              className={`block w-full rounded-[9px] px-3 py-2 text-left text-[13px] font-medium hover:bg-white/8 ${
                it.danger ? 'text-red-300' : 'text-white/85'
              }`}
            >
              {it.label}
            </button>
          ))}
          {isSelf && isAdmin && (
            <p className="px-3 py-1.5 text-[10.5px] leading-tight text-white/35">
              You can’t remove your own admin access.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function MembersTab({ selfId }: { selfId: string | null }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Debounced (re)load from the top whenever the query changes.
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api
        .adminUsers(query.trim() || undefined, PAGE, 0)
        .then((r) => {
          setUsers(r.users);
          setTotal(r.total);
          setError(null);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load members'))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    api
      .adminUsers(query.trim() || undefined, PAGE, users.length)
      .then((r) => {
        setUsers((prev) => [...prev, ...r.users]);
        setTotal(r.total);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load more members'))
      .finally(() => setLoadingMore(false));
  }, [query, users.length]);

  const runAction = useCallback(async () => {
    if (!pending) return;
    const { kind, user } = pending;
    setActionBusy(true);
    setActionError(null);
    try {
      let updated: AdminUser;
      if (kind === 'promote') {
        updated = await api.adminSetUserRoles(user.id, [...new Set([...user.roles, 'admin'])]);
      } else if (kind === 'demote') {
        const next = user.roles.filter((r) => r !== 'admin');
        updated = await api.adminSetUserRoles(user.id, next.length ? next : ['user']);
      } else if (kind === 'suspend') {
        updated = await api.adminSetUserStatus(user.id, 'SUSPENDED');
      } else if (kind === 'reactivate') {
        updated = await api.adminSetUserStatus(user.id, 'ACTIVE');
      } else {
        updated = await api.adminVerifyUser(user.id);
      }
      // Optimistically replace the row with the server's canonical version.
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setPending(null);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'Action failed');
    } finally {
      setActionBusy(false);
    }
  }, [pending]);

  return (
    <div className="grid gap-4">
      {/* Toolbar */}
      <div
        className="lg-glass flex h-[46px] w-full max-w-[340px] items-center gap-2.5 rounded-[12px] px-4"
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
          placeholder="Search members by name or email…"
          className="w-full bg-transparent text-[13.5px] text-white outline-none placeholder:text-white/45"
        />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-3">
        {users.map((u) => (
          <div
            key={u.id}
            className="lg-glass flex items-center gap-4 rounded-[16px] px-4 py-3"
            style={{ background: 'rgba(214,214,214,0.06)' }}
          >
            <span
              className="lg-glass grid h-11 w-11 flex-shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white"
              style={{ background: 'rgba(99,102,241,0.3)' }}
            >
              {initialsOf(u)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[14.5px] font-semibold text-white">
                  {u.displayName ?? '—'}
                </span>
                {u.id === selfId && <Pill tone="indigo">You</Pill>}
                {u.roles.map((r) => (
                  <Pill key={r} tone={r === 'admin' ? 'indigo' : 'neutral'}>
                    {r}
                  </Pill>
                ))}
                <Pill tone={userStatusTone(u.status)}>{u.status.toLowerCase()}</Pill>
                {!u.emailVerified && <Pill tone="draft">unverified</Pill>}
              </div>
              <p className="mt-0.5 truncate text-xs text-white/50">{u.email}</p>
            </div>
            <div className="hidden flex-shrink-0 text-right sm:block">
              <p className="text-[13px] font-semibold text-white">{u.purchases}</p>
              <p className="text-[10.5px] text-white/45">purchases</p>
            </div>
            <div className="hidden flex-shrink-0 text-right md:block">
              <p className="text-[13px] font-semibold text-white">
                {new Date(u.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <p className="text-[10.5px] text-white/45">joined</p>
            </div>
            <div className="flex-shrink-0">
              <ActionMenu
                user={u}
                isSelf={u.id === selfId}
                onAction={(kind) => {
                  setActionError(null);
                  setPending({ kind, user: u });
                }}
              />
            </div>
          </div>
        ))}

        {loading && users.length === 0 && (
          <div className="grid place-items-center py-10">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          </div>
        )}
        {!loading && users.length === 0 && !error && (
          <p className="py-10 text-center text-sm text-white/50">
            {query ? `No members matching “${query}”.` : 'No members yet.'}
          </p>
        )}
      </div>

      {users.length > 0 && (
        <LoadMore shown={users.length} total={total} loading={loadingMore} onClick={loadMore} />
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending ? ACTION_COPY[pending.kind].title : ''}
        body={pending ? ACTION_COPY[pending.kind].body(pending.user) : ''}
        confirmLabel={pending ? ACTION_COPY[pending.kind].confirm : ''}
        danger={pending ? ACTION_COPY[pending.kind].danger : false}
        busy={actionBusy}
        error={actionError}
        onConfirm={runAction}
        onCancel={() => {
          if (!actionBusy) setPending(null);
        }}
      />
    </div>
  );
}
