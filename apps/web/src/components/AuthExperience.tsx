'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { registerSchema } from '@cinnetemple/shared';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';

/**
 * Sliding split-panel auth — sign-in and sign-up share one surface and toggle
 * between them. Styled to match the landing page (Readex Pro · #0B0B0D · brand
 * red). All styling lives in globals.css under `.auth-experience`.
 */
export function AuthExperience({ initial = 'signin' }: { initial?: 'signin' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  const [toggled, setToggled] = useState(initial === 'signup');

  // Social sign-in via the Cognito Hosted UI (brokers Apple / Google).
  const hosted = (provider: 'Google' | 'SignInWithApple') => {
    const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
    if (!domain || !clientId || typeof window === 'undefined') return '#';
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: `${window.location.origin}/auth/callback`,
      identity_provider: provider,
    });
    return `https://${domain}/oauth2/authorize?${params.toString()}`;
  };

  const social = (
    <>
      <div className="auth-divider slide-element">or continue with</div>
      <div className="auth-social slide-element">
        <a href={hosted('SignInWithApple')}>Apple</a>
        <a href={hosted('Google')}>Google</a>
      </div>
    </>
  );

  // Sign-in state
  const [signin, setSignin] = useState({ email: '', password: '' });
  const [signinErr, setSigninErr] = useState<string | null>(null);
  const [signinLoading, setSigninLoading] = useState(false);
  const verified = params.get('verified') === '1';

  // Sign-up state
  const [signup, setSignup] = useState({ displayName: '', email: '', password: '' });
  const [signupErr, setSignupErr] = useState<string | null>(null);
  const [signupLoading, setSignupLoading] = useState(false);

  const onSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninErr(null);
    setSigninLoading(true);
    try {
      await login(signin.email, signin.password);
      router.push('/browse');
    } catch (err) {
      setSigninErr(err instanceof ApiError ? err.message : 'Unable to sign in');
    } finally {
      setSigninLoading(false);
    }
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupErr(null);
    const parsed = registerSchema.safeParse(signup);
    if (!parsed.success) {
      setSignupErr(parsed.error.issues[0]?.message ?? 'Please check your details');
      return;
    }
    setSignupLoading(true);
    try {
      await api.register(parsed.data);
      router.push(`/verify?email=${encodeURIComponent(signup.email)}`);
    } catch (err) {
      setSignupErr(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="auth-experience">
      <div className={`auth-wrapper${toggled ? ' toggled' : ''}`}>
        <div className="background-shape" aria-hidden />
        <div className="secondary-shape" aria-hidden />

        {/* Sign in */}
        <form className="credentials-panel signin" onSubmit={onSignin} noValidate>
          <h2 className="slide-element">Sign In</h2>
          <div className="field-wrapper slide-element">
            <input
              type="email"
              required
              autoComplete="email"
              value={signin.email}
              onChange={(e) => setSignin({ ...signin, email: e.target.value })}
            />
            <label>Email</label>
          </div>
          <div className="field-wrapper slide-element">
            <input
              type="password"
              required
              autoComplete="current-password"
              value={signin.password}
              onChange={(e) => setSignin({ ...signin, password: e.target.value })}
            />
            <label>Password</label>
            <a className="auth-forgot" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6 }} href="/forgot-password">
              Forgot password?
            </a>
          </div>
          <button className="submit-button slide-element" type="submit" disabled={signinLoading}>
            {signinLoading ? 'Signing in…' : 'Sign In'}
          </button>
          <p className="switch-link slide-element">
            Don’t have an account?{' '}
            <button type="button" onClick={() => setToggled(true)}>Register</button>
          </p>
          {social}
          {(signinErr || verified) && (
            <p className={`auth-msg ${signinErr ? 'error' : 'success'}`}>
              {signinErr ?? 'Email verified — you can sign in now.'}
            </p>
          )}
        </form>

        {/* Sign up */}
        <form className="credentials-panel signup" onSubmit={onSignup} noValidate>
          <h2 className="slide-element">Sign Up</h2>
          <div className="field-wrapper slide-element">
            <input
              type="text"
              required
              autoComplete="name"
              value={signup.displayName}
              onChange={(e) => setSignup({ ...signup, displayName: e.target.value })}
            />
            <label>Display name</label>
          </div>
          <div className="field-wrapper slide-element">
            <input
              type="email"
              required
              autoComplete="email"
              value={signup.email}
              onChange={(e) => setSignup({ ...signup, email: e.target.value })}
            />
            <label>Email</label>
          </div>
          <div className="field-wrapper slide-element">
            <input
              type="password"
              required
              autoComplete="new-password"
              value={signup.password}
              onChange={(e) => setSignup({ ...signup, password: e.target.value })}
            />
            <label>Password</label>
          </div>
          <button className="submit-button slide-element" type="submit" disabled={signupLoading}>
            {signupLoading ? 'Creating…' : 'Sign Up'}
          </button>
          <p className="switch-link slide-element">
            Already have an account?{' '}
            <button type="button" onClick={() => setToggled(false)}>Login</button>
          </p>
          {social}
          {signupErr && <p className="auth-msg error">{signupErr}</p>}
        </form>

        {/* Welcome — shown beside sign in (default) */}
        <div className="welcome-section signin">
          <p className="brand slide-element">cinne<b>temple</b></p>
          <h2 className="slide-element">Hello,<br />welcome!</h2>
          <p className="slide-element">New here? Create your account and your cinema awaits.</p>
          <button className="welcome-ghost slide-element" type="button" onClick={() => setToggled(true)}>
            Register
          </button>
        </div>

        {/* Welcome — shown beside sign up (toggled) */}
        <div className="welcome-section signup">
          <p className="brand slide-element">cinne<b>temple</b></p>
          <h2 className="slide-element">Welcome<br />back!</h2>
          <p className="slide-element">Already one of us? Step back into the cinema.</p>
          <button className="welcome-ghost slide-element" type="button" onClick={() => setToggled(false)}>
            Login
          </button>
        </div>
      </div>

      <p className="auth-footer">Your cinema, reimagined.</p>
    </div>
  );
}
