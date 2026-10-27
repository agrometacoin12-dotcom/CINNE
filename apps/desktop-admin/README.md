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
- Uploads presign via `POST /v1/admin/uploads/presign`, then the renderer uploads
  directly to object storage. Videos of 64 MiB or more use multipart PUTs with
  per-part retry, progress, cancellation, atomic completion, and a final size
  verification; smaller files use one direct PUT.

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

## macOS packages

`npm run dist:mac` builds DMG installers and ZIP app bundles for Apple Silicon
(`arm64`) and Intel (`x64`). The movie editor, producer assignment/email controls,
mobile preview and direct multipart uploads are shared with Windows.

For a local testing build without a Developer ID certificate:

```sh
STUDIO_ADHOC_SIGN=1 npm run dist:mac -- --config.mac.identity=null
```

This uses ad-hoc signing. It does not notarize the app or establish a trusted
publisher identity. Public distribution requires Developer ID signing and Apple
notarization; Apple Development / Apple Distribution certificates alone do not
fulfil that requirement for a directly distributed Mac app.

Output: `release/CinneTemple-Studio-1.3.0-mac-{arm64,x64}.{dmg,zip}`.
Open the matching DMG, drag CinneTemple Studio to Applications, and launch it.
Keep the app running while uploads finish. Authentication uses the existing
CinneTemple browser sign-in, and producer links use the backend mail service.


## Local 4K enhancement (1.3.0)

The movie editor includes **Enhance video**. Choose a source movie, choose a
10- or 30-second sample and its start time, then generate the sample. Compare the
original and processed clips, check the review box, and choose **Approve & process
full movie**. Pick a new output filename. Once finished, use **Select enhanced
movie for upload** to choose that MP4 and **Save & upload files**.

Processing runs locally using standalone FFmpeg: mild temporal/spatial denoising,
Lanczos scaling, mild sharpening, preserved aspect ratio with padding to
3840x2160, H.264 video and AAC audio. These are conventional filters, not AI
reconstruction. The first video and first audio track are exported; embedded
subtitles and additional audio tracks are not copied. Keep the app open, allow
free disk space for samples and the export, and expect long processing times for
feature films. Original files and existing destination files are never overwritten.
Selecting another source requires the current process to finish or be cancelled.

The exported original is 4K. This does not change the backend adaptive streaming
ladder (currently up to 1080p), nor does it bypass the backend upload size limit.

Before packaging, fetch the processor for each intended target:

```sh
npm run prepare:media -- darwin-arm64 darwin-x64 win32-x64
npm test
npm run dist:win
STUDIO_ADHOC_SIGN=1 npm run dist:mac -- --config.mac.identity=null
```

Processor binaries, upstream license notices and source links live in
`build/media-tools/` (ignored in Git) and are copied outside the app archive.
Packaging fails if its target processor is missing. Downloaded binaries come from
the pinned ffmpeg-static b6.1.1 release. Runtime media and filenames are not sent to
an enhancement service. Preview files are served only on a random loopback port
with random per-job identifiers, supporting seeking; they are removed on normal
app exit. Jobs are recoverable when reopening the editor within the same app
session, but are not resumed after app exit.
