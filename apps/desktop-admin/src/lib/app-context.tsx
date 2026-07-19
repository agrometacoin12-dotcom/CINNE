import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { HttpApiClient, WEB_BASE, type ApiClient, ApiError } from './api-client';
import { MockApiClient } from './mock-client';
import { UploadManager } from './uploads';
import { studio } from './bridge';
import { challengeFromVerifier, generateVerifier } from './pkce';
import type { Me } from './types';

export type ScreenName =
  'dashboard' | 'movies' | 'series' | 'users' | 'purchases' | 'audit' | 'settings';

export interface Route {
  screen: ScreenName;
  /** Optional record opened in an editor (e.g. a series id). */
  openId?: string;
}

export type AuthPhase =
  | { phase: 'booting' }
  | { phase: 'signedOut'; error?: string }
  | { phase: 'linking' }
  | { phase: 'blocked'; email: string | null }
  | { phase: 'ready'; me: Me };

export interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info';
  message: string;
}

interface StudioContextValue {
  client: ApiClient;
  uploads: UploadManager;
  flags: { mock: boolean; screenshotDir: string | null };
  version: string;
  auth: AuthPhase;
  route: Route;
  navigate: (route: Route) => void;
  signIn: () => Promise<void>;
  cancelSignIn: () => void;
  signOut: () => Promise<void>;
  toast: (message: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio outside provider');
  return ctx;
}

let toastSeq = 0;

export function StudioProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<{ mock: boolean; screenshotDir: string | null } | null>(null);
  const [version, setVersion] = useState('—');
  const [auth, setAuth] = useState<AuthPhase>({ phase: 'booting' });
  const [route, setRoute] = useState<Route>({ screen: 'dashboard' });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const linkingCancelled = useRef(false);

  const client = useMemo<ApiClient>(
    () => (flags?.mock ? new MockApiClient() : new HttpApiClient()),
    [flags?.mock],
  );
  const uploads = useMemo(() => new UploadManager(() => client), [client]);

  const toast = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, tone, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  /** Probe admin access: 200 => ready, 401/403 => blocked screen. */
  const probe = useCallback(async (): Promise<void> => {
    try {
      await client.stats();
      const me = await client.me();
      setAuth({ phase: 'ready', me });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        const email = await client
          .me()
          .then((m) => m.email)
          .catch(() => null);
        if (email) setAuth({ phase: 'blocked', email });
        else setAuth({ phase: 'signedOut' });
      } else {
        setAuth({
          phase: 'signedOut',
          error: err instanceof Error ? err.message : 'Could not reach the API',
        });
      }
    }
  }, [client]);

  // Boot: read flags/version, then restore any persisted session.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [f, v] = await Promise.all([studio.getFlags(), studio.getVersion()]);
      if (!alive) return;
      setFlags(f);
      setVersion(v);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!flags) return;
    let alive = true;
    void (async () => {
      const has = await client.hasSession();
      if (!alive) return;
      if (!has) {
        setAuth({ phase: 'signedOut' });
        return;
      }
      await probe();
    })();
    return () => {
      alive = false;
    };
  }, [flags, client, probe]);

  const signIn = useCallback(async () => {
    linkingCancelled.current = false;
    setAuth({ phase: 'linking' });
    try {
      const verifier = generateVerifier();
      const challenge = await challengeFromVerifier(verifier);
      const { port } = await studio.startAuthLoopback();
      await studio.openExternal(
        `${WEB_BASE}/desktop-auth?port=${port}&challenge=${encodeURIComponent(challenge)}`,
      );
      const code = await studio.awaitAuthCode();
      if (linkingCancelled.current) return;
      await client.exchangeDesktopCode(code, verifier);
      await probe();
    } catch (err) {
      if (!linkingCancelled.current) {
        setAuth({
          phase: 'signedOut',
          error: err instanceof Error && err.message !== 'auth cancelled' ? err.message : undefined,
        });
      }
    } finally {
      void studio.stopAuthLoopback();
    }
  }, [client, probe]);

  const cancelSignIn = useCallback(() => {
    linkingCancelled.current = true;
    void studio.stopAuthLoopback();
    setAuth({ phase: 'signedOut' });
  }, []);

  const signOut = useCallback(async () => {
    await client.logout().catch(() => undefined);
    await studio.clearTokens().catch(() => undefined);
    setRoute({ screen: 'dashboard' });
    setAuth({ phase: 'signedOut' });
  }, [client]);

  const navigate = useCallback((r: Route) => setRoute(r), []);

  const value = useMemo<StudioContextValue>(
    () => ({
      client,
      uploads,
      flags: flags ?? { mock: false, screenshotDir: null },
      version,
      auth,
      route,
      navigate,
      signIn,
      cancelSignIn,
      signOut,
      toast,
      toasts,
    }),
    [
      client,
      uploads,
      flags,
      version,
      auth,
      route,
      navigate,
      signIn,
      cancelSignIn,
      signOut,
      toast,
      toasts,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
