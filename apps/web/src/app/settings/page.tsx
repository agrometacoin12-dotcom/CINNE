'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AppShell } from '@/components/app/AppShell';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';

interface SessionRow {
  id: string;
  deviceId: string | null;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
}

function SettingsInner() {
  const { user, logout } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await api.sessions());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    await api.revokeSession(id).catch(() => undefined);
    await load();
  };

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          <h1 className="text-3xl font-bold">Settings</h1>

          {/* Account */}
          <GlassPanel className="p-6">
            <h2 className="text-lg font-bold">Account</h2>
            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">Email</dt>
                <dd>{user?.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">Status</dt>
                <dd>{user?.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">Two-factor (MFA)</dt>
                <dd>{user?.mfaEnabled ? 'Enabled' : 'Not enabled'}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-secondary)]">Roles</dt>
                <dd>{user?.roles.join(', ')}</dd>
              </div>
            </dl>
          </GlassPanel>

          {/* Appearance */}
          <GlassPanel className="flex items-center justify-between p-6">
            <div>
              <h2 className="text-lg font-bold">Appearance</h2>
              <p className="text-sm text-[var(--text-secondary)]">Switch between dark and light.</p>
            </div>
            <ThemeToggle />
          </GlassPanel>

          {/* Sessions */}
          <GlassPanel className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Active sessions</h2>
              <Button variant="ghost" onClick={() => void load()}>
                Refresh
              </Button>
            </div>
            {error && (
              <div className="mt-4">
                <Alert tone="error">{error}</Alert>
              </div>
            )}
            <ul className="mt-4 space-y-3">
              {loading && <li className="text-sm text-[var(--text-secondary)]">Loading…</li>}
              {!loading && sessions.length === 0 && (
                <li className="text-sm text-[var(--text-secondary)]">No active sessions.</li>
              )}
              {sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-glass border border-white/5 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{s.userAgent ?? 'Unknown device'}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {s.ip ?? 'unknown ip'} · since{' '}
                      {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Button variant="glass" onClick={() => void revoke(s.id)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </GlassPanel>

          {/* Danger / sign out */}
          <GlassPanel className="flex items-center justify-between p-6">
            <div>
              <h2 className="text-lg font-bold">Sign out</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                End your session on this device.
              </p>
            </div>
            <Button variant="primary" onClick={() => void logout()}>
              Sign out
            </Button>
          </GlassPanel>
        </motion.div>
      </main>
    </AppShell>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsInner />
    </RequireAuth>
  );
}
