# CinneTemple Studio (desktop admin)

Electron desktop console for CinneTemple administrators. Ships to Windows as an
installer (`.exe`, NSIS) and a portable exe. Everything the web studio does,
plus full series management: seasons, episodes, and per-episode video uploads
with a background upload tray.

- **Screens:** Dashboard (stats + recent audit), Movies (CRUD, artwork/video
  uploads, publish, featured, premiere scheduler), Series (seasons/episodes,
  per-episode uploads, publish gate: at least one episode with video), Users
  (roles, suspend/activate, verify, purchase history), Purchases, Audit,
  Settings.
- **Product rules baked in:** prices are entered in ₦ and stored in kobo;
  one series ticket covers all episodes and every episode is watch-once.

## Architecture

- Electron main + preload in `electron/` (bundled with esbuild to
  `dist-electron/`), React 18 + Vite renderer in `src/` (built to `dist/`).
- Renderer is sandboxed: `nodeIntegration: false`, `contextIsolation: true`,
  `sandbox: true`. The only bridge is `window.studio` (see
  `electron/preload.ts`): `openExternal` (https, cinnetemple.com hosts only),
  the auth loopback (`startAuthLoopback` / `awaitAuthCode` /
  `stopAuthLoopback`), encrypted token persistence via Electron `safeStorage`
  (written under `app.getPath('userData')`), app version, and CLI flags.
- API access lives behind a typed `ApiClient` interface
  (`src/lib/api-client.ts`) with two implementations: `HttpApiClient`
  (production, transparent refresh-token retry mirroring
  `apps/web/src/lib/api.ts`) and `MockApiClient` (`--mock`, fixture data).
- Uploads presign via `POST /v1/admin/uploads/presign`, then the renderer PUTs
  the `File` with `XMLHttpRequest` straight to storage — multi-GB files stream
  from disk with progress/speed/cancel/retry in the global tray.

## Auth flow (device link)

The exe never talks to Google. It piggybacks on the web app's working sign-in:

1. "Sign in with your browser" starts a loopback HTTP server on
   `127.0.0.1:<random port>` (main process) and generates a PKCE pair:
   `verifier` (32 random bytes, base64url) and
   `challenge = base64url(SHA-256(verifier))`.
2. The default browser opens
   `https://www.cinnetemple.com/desktop-auth?port=<port>&challenge=<challenge>`.
   The user signs in there (Google etc.) and approves; the page requests a
   single-use code from `POST /v1/auth/desktop/code` and redirects to
   `http://127.0.0.1:<port>/callback?code=...`.
3. The app exchanges it via `POST /v1/auth/desktop/exchange { code, verifier }`
   for a normal token pair, stored encrypted with `safeStorage`.
4. It then probes `GET /v1/admin/stats`: 200 enters the app; 401/403 shows the
   "administrators only" screen with the signed-in email and a sign-out button.

## Develop

```bash
pnpm install               # from the repo root (installs this workspace too)
pnpm --filter @cinnetemple/desktop-admin dev          # vite + electron
pnpm --filter @cinnetemple/desktop-admin dev -- --mock  # fixture data, no API
```

## Verification hooks

```bash
electron . --mock --screenshot-dir=/tmp/shots
```

With both flags the app signs in with the mock session, walks
Dashboard → Movies → Series editor → Users (~1.2 s apart), writes
`dashboard.png`, `movies.png`, `series.png`, `users.png` into the directory,
then quits. Driver: `src/dev/screenshot-driver.ts` (renderer) +
`studio:captureScreenshot` (main).

## Build & ship (Windows)

```bash
pnpm --filter @cinnetemple/desktop-admin build      # typecheck + renderer + electron bundles
pnpm --filter @cinnetemple/desktop-admin dist:win   # + icon + electron-builder --win
```

- `scripts/make-icon.mjs` converts `build/icon.png` → `build/icon.ico`.
- Artifacts land in `apps/desktop-admin/release/`:
  - `CinneTemple-Studio-Setup-<version>.exe` (NSIS installer; per-user,
    directory choice enabled)
  - `CinneTemple-Studio-<version>-portable.exe`

Settings → API base URL defaults to `https://api.cinnetemple.com` and is
persisted locally; the signed-in session is stored encrypted, never in
plain text.
