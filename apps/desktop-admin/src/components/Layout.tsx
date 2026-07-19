import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStudio, type ScreenName } from '../lib/app-context';
import { getApiBase, DEFAULT_API_BASE } from '../lib/api-client';
import logo from '../assets/logo.png';

const NAV: { id: ScreenName; label: string; icon: ReactNode }[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    id: 'movies',
    label: 'Movies',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
        <path d="M2.5 9h19M7 4v5M12 4v5M17 4v5" />
      </svg>
    ),
  },
  {
    id: 'series',
    label: 'Series',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="7" width="18" height="13" rx="2.5" />
        <path d="M8 3l4 4 4-4" />
      </svg>
    ),
  },
  {
    id: 'users',
    label: 'Users',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
        <circle cx="17.5" cy="9" r="2.6" />
        <path d="M15.6 14.7c2.8.2 5 1.9 5.9 4.8" />
      </svg>
    ),
  },
  {
    id: 'purchases',
    label: 'Purchases',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 6h16l-1.5 11.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5L4 6Z" />
        <path d="M8.5 9.5V6a3.5 3.5 0 0 1 7 0v3.5" />
      </svg>
    ),
  },
  {
    id: 'audit',
    label: 'Audit',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 4h9a1.5 1.5 0 0 1 1.5 1.5v14A1.5 1.5 0 0 1 18 21H7a1.5 1.5 0 0 1-1.5-1.5V8L9 4Z" />
        <path d="M9 4v4H5.5M9.5 12h6M9.5 16h6" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19" />
      </svg>
    ),
  },
];

const TITLES: Record<ScreenName, string> = {
  dashboard: 'Dashboard',
  movies: 'Movies',
  series: 'Series',
  users: 'Users',
  purchases: 'Purchases',
  audit: 'Audit log',
  settings: 'Settings',
};

export function Layout({ children }: { children: ReactNode }) {
  const { route, navigate, auth, signOut, flags } = useStudio();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const me = auth.phase === 'ready' ? auth.me : null;
  const initial = (me?.profile?.displayName ?? me?.email ?? '?').slice(0, 1).toUpperCase();
  const apiBase = getApiBase();
  const envLabel = flags.mock ? 'MOCK' : apiBase === DEFAULT_API_BASE ? 'PRODUCTION' : 'CUSTOM API';

  return (
    <div className="shell">
      <nav className="nav-rail">
        <div className="nav-logo">
          <img src={logo} alt="CinneTemple" />
          <div className="brand">
            CinneTemple
            <small>Studio</small>
          </div>
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item${route.screen === item.id ? ' active' : ''}`}
            onClick={() => navigate({ screen: item.id })}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="nav-spacer" />
      </nav>

      <div className="main-col">
        <header className="topbar">
          <h1>{TITLES[route.screen]}</h1>
          <div className="topbar-right">
            <span className={`env-chip${flags.mock ? ' mock' : ''}`}>{envLabel}</span>
            <div className="account-menu" ref={menuRef}>
              <button className="account-btn" onClick={() => setMenuOpen((o) => !o)}>
                <span className="avatar">{initial}</span>
                <span>{me?.profile?.displayName ?? me?.email ?? 'Account'}</span>
              </button>
              {menuOpen ? (
                <div className="menu-pop">
                  <div className="who">
                    <div className="em">{me?.email ?? '—'}</div>
                    <div className="sub">{me?.roles.join(' · ') ?? ''}</div>
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate({ screen: 'settings' });
                    }}
                  >
                    Settings
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      void signOut();
                    }}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
