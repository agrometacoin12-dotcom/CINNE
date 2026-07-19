import { useStudio } from '../lib/app-context';
import logo from '../assets/logo.png';

export function SignInScreen() {
  const { auth, signIn, cancelSignIn } = useStudio();
  const linking = auth.phase === 'linking';
  const error = auth.phase === 'signedOut' ? auth.error : undefined;

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img className="logo" src={logo} alt="CinneTemple" />
        <h1>CinneTemple Studio</h1>
        <p className="sub">
          Admin console for the CinneTemple cinema. Sign in with your browser to continue.
        </p>
        {linking ? (
          <>
            <div className="spinner" />
            <p className="sub" style={{ marginTop: 18 }}>
              Waiting for you to approve in the browser…
            </p>
            <button className="btn btn-ghost" onClick={cancelSignIn}>
              Cancel
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => void signIn()}
          >
            Sign in with your browser
          </button>
        )}
        {error ? <div className="auth-error">{error}</div> : null}
      </div>
    </div>
  );
}

export function BlockedScreen() {
  const { auth, signOut } = useStudio();
  const email = auth.phase === 'blocked' ? auth.email : null;
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img className="logo" src={logo} alt="CinneTemple" />
        <h1>Administrators only</h1>
        <p className="sub">
          This app is for CinneTemple administrators.
          {email ? (
            <>
              {' '}
              You are signed in as <strong style={{ color: 'var(--text)' }}>{email}</strong>, which
              does not have admin access.
            </>
          ) : null}
        </p>
        <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export function BootScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img className="logo" src={logo} alt="CinneTemple" />
        <div className="spinner" />
      </div>
    </div>
  );
}
