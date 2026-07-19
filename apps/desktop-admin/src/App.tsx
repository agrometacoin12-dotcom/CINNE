import { useEffect } from 'react';
import { StudioProvider, useStudio } from './lib/app-context';
import { Layout } from './components/Layout';
import { Toasts, UploadTray } from './components/UploadTray';
import { BlockedScreen, BootScreen, SignInScreen } from './screens/SignIn';
import { DashboardScreen } from './screens/Dashboard';
import { MoviesScreen } from './screens/Movies';
import { SeriesScreen } from './screens/Series';
import { UsersScreen } from './screens/Users';
import { PurchasesScreen } from './screens/Purchases';
import { AuditScreen } from './screens/Audit';
import { SettingsScreen } from './screens/Settings';
import { runScreenshotSequence } from './dev/screenshot-driver';

function Screens() {
  const { route } = useStudio();
  switch (route.screen) {
    case 'dashboard':
      return <DashboardScreen />;
    case 'movies':
      return <MoviesScreen />;
    case 'series':
      return <SeriesScreen />;
    case 'users':
      return <UsersScreen />;
    case 'purchases':
      return <PurchasesScreen />;
    case 'audit':
      return <AuditScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

function Root() {
  const { auth, flags, client, navigate } = useStudio();

  // Verification hook: with --mock --screenshot-dir, walk the screens once ready.
  useEffect(() => {
    if (auth.phase === 'ready' && flags.mock && flags.screenshotDir) {
      void runScreenshotSequence(client, navigate);
    }
  }, [auth.phase, flags.mock, flags.screenshotDir, client, navigate]);

  if (auth.phase === 'booting') return <BootScreen />;
  if (auth.phase === 'signedOut' || auth.phase === 'linking') return <SignInScreen />;
  if (auth.phase === 'blocked') return <BlockedScreen />;

  return (
    <Layout>
      <Screens />
    </Layout>
  );
}

export default function App() {
  return (
    <StudioProvider>
      <Root />
      <Toasts />
      <UploadTray />
    </StudioProvider>
  );
}
