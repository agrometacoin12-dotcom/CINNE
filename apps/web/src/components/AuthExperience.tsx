'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { registerSchema } from '@cinnetemple/shared';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { artPoster } from '@/lib/poster';

/**
 * Auth — exact Figma (Sign In 42:13463 / Sign Up 42:14729): poster-collage bg at
 * 25% behind an rgba(0,0,0,0.55) scrim, indigo play-logo, and a liquid-glass card
 * with "Welcome back", glassy metallic inputs, indigo "Sign In", an "or" divider,
 * and glass Apple / Google buttons.
 */
export function AuthExperience({ initial = 'signin' }: { initial?: 'signin' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>(initial);
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
      if (mode === 'signin') {
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
      setError(err instanceof ApiError ? err.message : mode === 'signin' ? 'Unable to sign in' : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const label = 'mb-2 block text-[12px] font-semibold text-white/75';
  const input = 'lg-input h-[46px] w-full rounded-[12px] px-4 text-[13px] text-white placeholder:text-white/50 outline-none';
  const pw = mode === 'signin' ? signin.password : signup.password;

  return (
    <main className="relative flex min-h-screen justify-center overflow-hidden bg-[#09090b]">
      <div className="relative flex w-full max-w-[430px] flex-col items-center px-4">
        {/* Poster collage + scrim */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artPoster('auth-collage')} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-black/55" />
        </div>

        {/* Logo */}
        <span className="relative z-10 mt-[8vh] grid h-14 w-14 place-items-center rounded-[16px] cine-grad shadow-lg shadow-[#4f46e5]/40">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7L8 5Z" /></svg>
        </span>

        {/* Card */}
        <div className="relative z-10 mt-5 w-full max-w-[361px] overflow-hidden rounded-[20px] lg-glass px-6 py-8">
          <h1 className="font-readex text-[24px] font-bold text-white">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mt-1.5 text-[13px] text-white/60">
            {mode === 'signin' ? 'Sign in to continue watching' : 'Join CinneTemple in seconds'}
          </p>

          <form onSubmit={onSubmit} className="mt-5 flex flex-col" noValidate>
            {verified && mode === 'signin' && (
              <p className="mb-3 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">Email verified — you can sign in now.</p>
            )}
            {error && <p className="mb-3 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-[13px] text-white">{error}</p>}

            {mode === 'signup' && (
              <>
                <span className={label}>Name</span>
                <input className={`${input} mb-4`} value={signup.displayName} onChange={(e) => setSignup({ ...signup, displayName: e.target.value })} autoComplete="name" placeholder="Your name" />
              </>
            )}

            <span className={label}>Email</span>
            <input
              type="email"
              className={`${input} mb-4`}
              autoComplete="email"
              placeholder="you@example.com"
              value={mode === 'signin' ? signin.email : signup.email}
              onChange={(e) => (mode === 'signin' ? setSignin({ ...signin, email: e.target.value }) : setSignup({ ...signup, email: e.target.value }))}
            />

            <span className={label}>Password</span>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                className={`${input} pr-11`}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                value={pw}
                onChange={(e) => (mode === 'signin' ? setSignin({ ...signin, password: e.target.value }) : setSignup({ ...signup, password: e.target.value }))}
              />
              {pw.length > 0 && (
                <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white">
                  {showPw ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.2 4.2M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 4-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              )}
            </div>

            {mode === 'signin' && (
              <div className="mt-2.5 flex justify-end">
                <Link href="/forgot-password" className="text-[12px] font-semibold text-[#6c6ffc]">Forgot password?</Link>
              </div>
            )}

            <button type="submit" disabled={loading} className="lg-glass-indigo-35 mt-4 flex h-12 items-center justify-center rounded-[12px] text-[14.5px] font-semibold text-white disabled:opacity-60">
              {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create account'}
            </button>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/15" />
              <span className="text-[12px] text-white/50">or</span>
              <span className="h-px flex-1 bg-white/15" />
            </div>

            <a href={hosted('SignInWithApple')} className="lg-soft mb-3 flex h-[46px] items-center justify-center gap-2 rounded-[12px] text-[13.5px] font-semibold text-white/90">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16.36 12.9c.02 2.28 2 3.04 2.03 3.05-.02.05-.32 1.1-1.05 2.18-.63.94-1.29 1.87-2.32 1.89-1.01.02-1.34-.6-2.5-.6-1.16 0-1.52.58-2.48.62-1 .04-1.76-1.02-2.4-1.95-1.3-1.9-2.3-5.36-.96-7.7.66-1.16 1.85-1.9 3.14-1.92.98-.02 1.9.66 2.5.66.6 0 1.72-.82 2.9-.7.49.02 1.88.2 2.77 1.5-.07.05-1.65.97-1.63 2.87M14.6 6.15c.53-.64.89-1.53.79-2.42-.76.03-1.69.51-2.24 1.15-.49.56-.92 1.47-.8 2.33.85.07 1.72-.43 2.25-1.06" /></svg>
              Continue with Apple
            </a>
            <a href={hosted('Google')} className="lg-soft flex h-[46px] items-center justify-center gap-2 rounded-[12px] text-[13.5px] font-semibold text-white/90">
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-7.8Z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .66-2.2 1.05-3.8 1.05-2.9 0-5.4-2-6.3-4.6H2v2.8A11 11 0 0 0 12 23Z" /><path fill="#FBBC05" d="M5.7 14.05a6.6 6.6 0 0 1 0-4.2V7.05H2a11 11 0 0 0 0 9.9l3.7-2.9Z" /><path fill="#EB4335" d="M12 5.2c1.63 0 3.1.56 4.25 1.66l3.16-3.16A11 11 0 0 0 2 7.05l3.7 2.8C6.6 7.25 9.1 5.2 12 5.2Z" /></svg>
              Continue with Google
            </a>
          </form>
        </div>

        {/* Footer switch */}
        <button
          type="button"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
          className="relative z-10 mt-6 pb-8 text-[13px] text-white/60"
        >
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <span className="font-semibold text-[#6c6ffc]">{mode === 'signin' ? 'Sign Up' : 'Sign In'}</span>
        </button>
      </div>
    </main>
  );
}
