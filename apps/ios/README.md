# CinneTemple iOS

SwiftUI app (iPhone + iPad) — MVVM, Swift Concurrency, dependency injection,
Keychain + biometric login, offline hydration, and the **Netflix-style + Liquid
Glass** design language (see [`docs/UI_DESIGN.md`](../../docs/UI_DESIGN.md)).

Open `CinneTemple.xcodeproj` in Xcode and run. The project uses Xcode's
file-system-synchronized groups, so every file under `CinneTemple/` is compiled
automatically — no manual target membership needed.

## Architecture

```
CinneTempleApp            @main → builds AppContainer, injects SessionStore
ContentView (RootView)    routes on SessionStore.phase: loading / locked / auth / app
Core/
  DI/AppContainer         composition root + AppConfig (API base URL)
  Networking/             APIClient (async/await, 401 refresh) · AuthAPI · APIError
  Security/               KeychainStore (tokens) · BiometricAuthenticator (Face/Touch ID)
  Persistence/            OfflineCache (last-known user as JSON)
  Session/SessionStore    token lifecycle, biometric lock, TokenProviding
Theme/                    tokens · GlassCard/PrimaryButton/GlassField · CinematicBackground
Features/
  Auth/                   AuthViewModel + landing/login/register/verify/forgot/reset
  Main/                   MainTabView · Home · Profile · Settings
```

MVVM: views are thin; `AuthViewModel`, `ProfileViewModel`, `SettingsViewModel`
own state and call the API. DI via `AppContainer` passed through the SwiftUI
environment. The whole project compiles under Swift's MainActor-default isolation.

## Features (Phase 1)

- Onboarding/landing, register, email verification, login, forgot/reset password.
- Secure token storage in Keychain; transparent refresh-token rotation on 401.
- Biometric app lock (Face ID / Touch ID), toggleable in Settings.
- Offline: last-known user hydrated from cache before the network refresh.
- Home (Netflix-style hero + rows, pull-to-refresh), Profile editor, Settings
  with active-session management and sign-out.
- Haptics, spring animations, dark-first cinematic theme.

## Configuration

`AppConfig.apiBaseURL` defaults to `https://api.cinnetemple.com`. Override with an
`API_BASE_URL` entry in Info settings (build setting / xcconfig).

### Local backend (http://localhost:4000)

Apple's App Transport Security blocks plain HTTP. To test against the local
backend, either run the API behind HTTPS, or add an ATS exception in Xcode:
Target → Info → add `App Transport Security Settings` →
`Allow Arbitrary Loads` = YES (development only), and set `API_BASE_URL` to
`http://localhost:4000`. The verification/reset codes print in the backend log
when `AUTH_DRIVER=local`.

## Background sync

`BackgroundSyncManager` uses `BGTaskScheduler` to refresh the browse cache so the
app opens with fresh content offline. Wiring is in `CinneTempleApp` via the
SwiftUI `.backgroundTask(.appRefresh:)` scene modifier; it reschedules whenever
the app enters the background.

Required Xcode configuration (one-time):

1. **Signing & Capabilities → + Background Modes →** check *Background fetch*
   (and *Background processing*).
2. **Info** → add array `Permitted background task scheduler identifiers`
   (`BGTaskSchedulerPermittedIdentifiers`) with one item:
   `com.cinnetemple.app.refresh` — must match `BackgroundSyncManager.taskIdentifier`.

Test in Xcode by pausing in the debugger and running:
`e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.cinnetemple.app.refresh"]`

## Next increments

Push notifications (SNS → APNs), passkey enrollment, and Phase 3 realtime.
