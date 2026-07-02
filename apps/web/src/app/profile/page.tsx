'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AppShell } from '@/components/app/AppShell';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { RequireAuth } from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';

type RowIcon = 'bell' | 'download' | 'globe' | 'help';

function RowGlyph({ name }: { name: RowIcon }) {
  const c = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'bell': return <svg {...c}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.5 21a2 2 0 0 0 3 0" /></svg>;
    case 'download': return <svg {...c}><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>;
    case 'globe': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>;
    case 'help': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01" /></svg>;
  }
}

function ProfileInner() {
  const { user, refreshUser, logout } = useAuth();
  const [form, setForm] = useState({ displayName: '', bio: '', avatarUrl: '' });
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

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
      setEditing(false);
    } catch (err) {
      setStatus({ tone: 'error', msg: err instanceof ApiError ? err.message : 'Update failed' });
    } finally {
      setLoading(false);
    }
  };

  const displayName = user?.profile?.displayName ?? 'Your profile';
  const initials = (user?.profile?.displayName ?? user?.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const isPremium = Boolean(user?.isAdmin || user?.roles?.includes('premium') || user?.roles?.includes('admin'));

  const rows: { icon: RowIcon; label: string; href: string; external?: boolean }[] = [
    { icon: 'bell', label: 'Notifications', href: '/settings' },
    { icon: 'download', label: 'Downloads', href: '/tickets' },
    { icon: 'globe', label: 'Language', href: '/settings' },
    { icon: 'help', label: 'Help & Support', href: 'mailto:support@cinnetemple.com', external: true },
  ];

  return (
    <AppShell>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Profile header card */}
          <div className="lg-glass flex flex-col items-center rounded-[22px] px-6 py-8 text-center">
            <span className="grid h-24 w-24 place-items-center rounded-full cine-grad text-3xl font-bold text-white">{initials}</span>
            <h1 className="mt-4 text-2xl font-semibold text-white">{displayName}</h1>
            <p className="mt-1 text-sm text-white/55">{user?.email}</p>
            <span className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-white" style={{ background: 'rgba(99,102,241,0.2)' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#8082ff"><path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8Z" /></svg>
              {isPremium ? 'Premium · renews Aug 2026' : 'Free plan'}
            </span>

            <div className="mt-6 flex w-full items-center justify-center gap-3">
              <button onClick={() => { setEditing((v) => !v); setStatus(null); }} className="lg-glass-indigo flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-semibold text-white">
                Edit Profile
              </button>
              <Link href="/settings" className="lg-glass flex h-11 flex-1 items-center justify-center rounded-xl text-sm font-semibold text-white">
                Manage Plan
              </Link>
            </div>
          </div>

          {/* Inline edit form */}
          {editing && (
            <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4 rounded-[22px] border border-[#121724] bg-[#0a0d14] p-6" noValidate>
              {status && <Alert tone={status.tone}>{status.msg}</Alert>}
              <TextField label="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
              <TextField label="Avatar URL" value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} placeholder="https://…" />
              <TextField label="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="A little about you" />
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => setEditing(false)} className="rounded-xl px-4 py-2.5 text-sm text-white/60 hover:text-white">Cancel</button>
                <Button type="submit" loading={loading}>Save changes</Button>
              </div>
            </form>
          )}

          {/* Settings rows */}
          <div className="mt-6 flex flex-col gap-3">
            {rows.map((r) =>
              r.external ? (
                <a key={r.label} href={r.href} className="lg-glass flex h-[58px] items-center gap-4 rounded-[16px] px-5 text-white transition hover:brightness-110">
                  <RowGlyph name={r.icon} />
                  <span className="flex-1 text-[15px]">{r.label}</span>
                  <span className="text-white/40">›</span>
                </a>
              ) : (
                <Link key={r.label} href={r.href} className="lg-glass flex h-[58px] items-center gap-4 rounded-[16px] px-5 text-white transition hover:brightness-110">
                  <RowGlyph name={r.icon} />
                  <span className="flex-1 text-[15px]">{r.label}</span>
                  <span className="text-white/40">›</span>
                </Link>
              ),
            )}
          </div>

          {/* Sign out */}
          <button onClick={() => void logout()} className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] text-[15px] font-semibold text-[#f2555a]" style={{ background: 'rgba(191,21,21,0.06)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M4 12h11" /></svg>
            Sign Out
          </button>
        </motion.div>
      </main>
    </AppShell>
  );
}

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfileInner />
    </RequireAuth>
  );
}
