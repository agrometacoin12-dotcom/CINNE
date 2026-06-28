'use client';

import { Button } from '@/components/ui/Button';

/**
 * Social sign-in entry points. These redirect to the Cognito Hosted UI, which
 * brokers Apple/Google. Configured once the Auth stack is deployed and the
 * NEXT_PUBLIC_COGNITO_* values are set.
 */
export function OAuthButtons() {
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN;
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID;
  const redirect =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';

  const hosted = (provider: 'Google' | 'SignInWithApple') => {
    if (!domain || !clientId) return '#';
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: redirect,
      identity_provider: provider,
    });
    return `https://${domain}/oauth2/authorize?${params.toString()}`;
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <a href={hosted('SignInWithApple')}>
        <Button variant="glass" fullWidth type="button"> Apple</Button>
      </a>
      <a href={hosted('Google')}>
        <Button variant="glass" fullWidth type="button">
          G&nbsp;Google
        </Button>
      </a>
    </div>
  );
}
