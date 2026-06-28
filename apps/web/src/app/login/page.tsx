'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { OAuthButtons } from '@/components/OAuthButtons';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const justVerified = params.get('verified') === '1';
  const { login } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(form.email, form.password);
      router.push('/profile');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Welcome back. The sanctuary awaits."
      footer={
        <>
          New to CinneTemple?{' '}
          <Link href="/register" className="font-semibold text-[var(--text-primary)] underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {justVerified && <Alert tone="success">Email verified — you can sign in now.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <TextField
          label="Email Address"
          type="email"
          placeholder="you@sanctuary.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          autoComplete="email"
        />
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="current-password"
          />
          <Link
            href="/forgot-password"
            className="self-end text-xs font-medium text-sky-600 hover:underline"
          >
            Forgot Password?
          </Link>
        </div>
        <Button type="submit" loading={loading} fullWidth>
          Sign in
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
        <span className="h-px flex-1 bg-black/15" /> or continue with{' '}
        <span className="h-px flex-1 bg-black/15" />
      </div>
      <OAuthButtons />
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
