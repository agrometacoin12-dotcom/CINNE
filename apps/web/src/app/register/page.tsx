'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registerSchema } from '@cinnetemple/shared';
import { AuthShell } from '@/components/AuthShell';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { OAuthButtons } from '@/components/OAuthButtons';
import { api, ApiError } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await api.register(parsed.data);
      router.push(`/verify?email=${encodeURIComponent(form.email)}`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join CinneTemple in seconds."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-[var(--text-primary)] underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <TextField
          label="Display name"
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          error={errors.displayName}
          autoComplete="name"
        />
        <TextField
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.email}
          autoComplete="email"
        />
        <TextField
          label="Password"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          error={errors.password}
          hint="At least 12 characters with upper, lower, number, and symbol."
          autoComplete="new-password"
        />
        <Button type="submit" loading={loading} fullWidth>
          Create account
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
