'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPasswordSchema } from '@cinnetemple/shared';
import { AuthShell } from '@/components/AuthShell';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { api, ApiError } from '@/lib/api';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState({
    email: params.get('email') ?? '',
    code: '',
    newPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const parsed = resetPasswordSchema.safeParse(form);
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
      await api.resetPassword(parsed.data);
      router.push('/login?verified=1');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Enter the code we emailed you and choose a new password."
      footer={
        <Link href="/login" className="font-semibold text-[var(--text-primary)] underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <TextField
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          error={errors.email}
          autoComplete="email"
        />
        <TextField
          label="Reset code"
          inputMode="numeric"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          error={errors.code}
          placeholder="123456"
          autoComplete="one-time-code"
        />
        <TextField
          label="New password"
          type="password"
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          error={errors.newPassword}
          hint="At least 12 characters with upper, lower, number, and symbol."
          autoComplete="new-password"
        />
        <Button type="submit" loading={loading} fullWidth>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
