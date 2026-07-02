'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registerSchema } from '@cinnetemple/shared';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';

const BG_IMAGE = '/art/hero/11111111-1111-4111-8111-000000000001.jpg';

/**
 * Auth screen — exact Figma spec: a single full-bleed background image with two
 * top→bottom black gradients, and a centered glass panel (rgba(0,0,0,0.12),
 * faint white border, 26px radius) holding "Welcome" + Sign In / Sign Up tabs
 * (white underline), thin white-bordered inputs, and white-bordered pill
 * Apple / Google buttons. Monochrome — canvas #090B12.
 */
export function AuthExperience({ initial = 'signin' }: { initial?: 'signin' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  const [tab, setTab] = useState<'signin' | 'signup'>(initial);
  const [showPw, setShowPw] = useState(false);
  const verified = params.get('verified') === '1';

  const [signin, setSignin] = useState({ email: '', password: '' });
  const [signup, setSignup] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hosted = (provider: 'Google' | 'SignInWithApple') => {
    const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    if (!domain || !clientId || typeof window === 'undefined') return '#';
    const p = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: `${window.location.origin}/auth/callback`,
      identity_provider: provider,
    });
    return `https://${domain}/oauth2/authorize?${p.toString()}`;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (tab === 'signin') {
        await login(signin.email, signin.password);
        router.push('/browse');
      } else {
        const parsed = registerSchema.safeParse(signup);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Please check your details');
          return;
        }
        await api.register(parsed.data);
        router.push(`/verify?email=${encodeURIComponent(signup.email)}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tab === 'signin' ? 'Unable to sign in' : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const label = 'mb-2 block text-[17px] font-normal text-white';
  const input = 'w-full rounded-[10px] border border-white/25 bg-white/[0.03] px-4 py-3 text-[15px] text-white placeholder:text-white/35 outline-none transition focus:border-white/60';
  const scrim = 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 40.22%, rgba(0,0,0,0.9) 100%)';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#090b12] px-4 py-10">
      {/* Full-bleed background image + two gradient scrims */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BG_IMAGE} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: scrim }} />
        <div className="absolute inset-0" style={{ background: scrim }} />
      </div>

      {/* Glass panel */}
      <div
        className="relative flex w-full max-w-[645px] flex-col rounded-[26px] border border-white/[0.12] backdrop-blur-xl"
        style={{ background: 'rgba(0,0,0,0.12)', boxShadow: '0 22px 18px rgba(0,0,0,0.2), inset -4.6px -3.7px 37px rgba(0,0,0,0.12)' }}
      >
        {/* Header */}
        <div className="flex flex-col gap-3 border-b border-white/[0.12] px-[30px] pt-[30px]">
          <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-white">Welcome</h1>
          <div className="flex items-center gap-5">
            {(['signin', 'signup'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setError(null); }}
                className={`-mb-px border-b-2 px-1 pb-[18px] pt-[18px] text-[15px] text-white ${tab === t ? 'border-white font-semibold' : 'border-transparent font-normal'}`}
              >
                {t === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="flex flex-col gap-5 px-[30px] py-7" noValidate>
          {verified && tab === 'signin' && (
            <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">Email verified — you can sign in now.</p>
          )}
          {error && <p className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white">{error}</p>}

          {tab === 'signup' && (
            <div>
              <span className={label}>Name</span>
              <input className={input} value={signup.displayName} onChange={(e) => setSignup({ ...signup, displayName: e.target.value })} autoComplete="name" />
            </div>
          )}

          <div>
            <span className={label}>Email</span>
            <input
              type="email"
              className={input}
              autoComplete="email"
              value={tab === 'signin' ? signin.email : signup.email}
              onChange={(e) => tab === 'signin' ? setSignin({ ...signin, email: e.target.value }) : setSignup({ ...signup, email: e.target.value })}
            />
          </div>

          <div>
            <span className={label}>Password</span>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className={`${input} pr-12`}
                autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                value={tab === 'signin' ? signin.password : signup.password}
                onChange={(e) => tab === 'signin' ? setSignin({ ...signin, password: e.target.value }) : setSignup({ ...signup, password: e.target.value })}
              />
              {(tab === 'signin' ? signin.password : signup.password).length > 0 && (
                <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white">
                  {showPw ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.2 4.2M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 4-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              )}
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full rounded-full bg-white py-3.5 text-[15px] font-semibold text-[#090b12] transition hover:bg-white/90 disabled:opacity-60">
            {loading ? 'Please wait…' : tab === 'signin' ? 'Sign In' : 'Create account'}
          </button>

          <p className="text-[17px] text-white">
            {tab === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button type="button" onClick={() => setTab(tab === 'signin' ? 'signup' : 'signin')} className="font-medium underline">
              {tab === 'signin' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>

          <a href={hosted('SignInWithApple')} className="flex items-center justify-center gap-3 rounded-full border border-white/40 py-3.5 text-[18px] text-white transition hover:bg-white/[0.06]">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#000"><path d="M16.36 12.9c.02 2.28 2 3.04 2.03 3.05-.02.05-.32 1.1-1.05 2.18-.63.94-1.29 1.87-2.32 1.89-1.01.02-1.34-.6-2.5-.6-1.16 0-1.52.58-2.48.62-1 .04-1.76-1.02-2.4-1.95-1.3-1.9-2.3-5.36-.96-7.7.66-1.16 1.85-1.9 3.14-1.92.98-.02 1.9.66 2.5.66.6 0 1.72-.82 2.9-.7.49.02 1.88.2 2.77 1.5-.07.05-1.65.97-1.63 2.87M14.6 6.15c.53-.64.89-1.53.79-2.42-.76.03-1.69.51-2.24 1.15-.49.56-.92 1.47-.8 2.33.85.07 1.72-.43 2.25-1.06" /></svg>
            </span>
            Continue with Apple
          </a>
          <a href={hosted('Google')} className="flex items-center justify-center gap-3 rounded-full border border-white/40 py-3.5 text-[18px] text-white transition hover:bg-white/[0.06]">
            <svg width="19" height="19" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-7.8Z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .66-2.2 1.05-3.8 1.05-2.9 0-5.4-2-6.3-4.6H2v2.8A11 11 0 0 0 12 23Z" /><path fill="#FBBC05" d="M5.7 14.05a6.6 6.6 0 0 1 0-4.2V7.05H2a11 11 0 0 0 0 9.9l3.7-2.9Z" /><path fill="#EB4335" d="M12 5.2c1.63 0 3.1.56 4.25 1.66l3.16-3.16A11 11 0 0 0 2 7.05l3.7 2.8C6.6 7.25 9.1 5.2 12 5.2Z" /></svg>
            Continue with Google
          </a>
        </form>
      </div>
    </main>
  );
}
