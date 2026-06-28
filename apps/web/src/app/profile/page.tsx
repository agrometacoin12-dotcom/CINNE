'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { GlassNav } from '@/components/glass/GlassNav';
import { GlassPanel } from '@/components/glass/GlassPanel';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';

function ProfileInner() {
  const { user, refreshUser } = useAuth();
  const [form, setForm] = useState({ displayName: '', bio: '', avatarUrl: '' });
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.profile) {
      setForm({
        displayName: user.profile.displayName ?? '',
        bio: '',
        avatarUrl: user.profile.avatarUrl ?? '',
      });
    }
  }, [user]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setLoading(true);
    try {
      await api.updateProfile({
        displayName: form.displayName,
        bio: form.bio || undefined,
        avatarUrl: form.avatarUrl || undefined,
      });
      await refreshUser();
      setStatus({ tone: 'success', msg: 'Profile updated.' });
    } catch (err) {
      setStatus({
        tone: 'error',
        msg: err instanceof ApiError ? err.message : 'Update failed',
      });
    } finally {
      setLoading(false);
    }
  };

  const initials = (user?.profile?.displayName ?? user?.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      <GlassNav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <GlassPanel className="mb-6 flex items-center gap-5 p-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/80 text-2xl font-bold text-white">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{user?.profile?.displayName ?? 'Your profile'}</h1>
              <p className="text-sm text-[var(--text-secondary)]">{user?.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {user?.roles.map((r) => (
                  <span
                    key={r}
                    className="glass rounded-pill px-3 py-0.5 text-xs text-[var(--text-secondary)]"
                  >
                    {r}
                  </span>
                ))}
                {user?.emailVerified && (
                  <span className="rounded-pill bg-emerald-500/20 px-3 py-0.5 text-xs text-emerald-300">
                    verified
                  </span>
                )}
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="p-6">
            <h2 className="text-lg font-bold">Edit profile</h2>
            <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
              {status && <Alert tone={status.tone}>{status.msg}</Alert>}
              <TextField
                label="Display name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
              <TextField
                label="Avatar URL"
                value={form.avatarUrl}
                onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
                placeholder="https://…"
              />
              <TextField
                label="Bio"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="A little about you"
              />
              <div className="flex items-center justify-between">
                <Link href="/settings" className="text-sm text-[var(--text-secondary)] underline">
                  Account settings →
                </Link>
                <Button type="submit" loading={loading}>
                  Save changes
                </Button>
              </div>
            </form>
          </GlassPanel>
        </motion.div>
      </main>
    </>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileInner />
    </RequireAuth>
  );
}
