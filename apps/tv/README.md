# CinneTemple TV — LG webOS / Hisense VIDAA

Shared TV client targeting **2020 and newer models**. This is a buildable viewer app, not a store-approved release. No production services or mobile source files were changed.

## What works

- D-pad navigation with visible focus, OK, Back, pointer clicks, and media remote keys.
- Existing email/password accounts, stored refresh token, serialized refresh rotation, sign-out. Temporary network/429/5xx errors retain the session.
- Public catalogue, search, premieres, authenticated tickets and watchlist.
- Film details, season/episode selection, watched-episode restrictions, free-ticket claims.
- Native HTML5 video playback using the backend's signed URLs, resume for movies, watermarks, pause/seek, expiry lockout, progress heartbeats and cleanup on exit/background.
- Paid-ticket handoff to the existing website; refresh on TV after purchase.
- Separate platform builds and an LG hosted-app launcher (`appinfo.json`).

Not included: phone pairing/QR login, TV payment entry, premiere chat, wallet/funding, admin/producer tools, offline video downloads, subtitles/audio-track selection, DRM license integration or store submission. HTML overlays do not provide hardware DRM or guarantee capture prevention. Native media format/codec support must be checked on actual target TVs.

## Build and preview

From the repository root:

```sh
pnpm install
pnpm --filter @cinnetemple/tv build
pnpm --filter @cinnetemple/tv test
pnpm --filter @cinnetemple/tv dev
```

Open `http://localhost:4173/webos/` or `http://localhost:4173/vidaa/`. Build outputs are ignored by Git. Build before starting the preview server; it does not live-reload.

| Variable | Default | Purpose |
|---|---|---|
| `TV_API_BASE_URL` | `https://api.cinnetemple.com` | Existing REST API |
| `TV_WEBSITE_URL` | `https://cinnetemple.com` | Account and ticket purchases |
| `TV_WEBOS_APP_URL` | `https://cinnetemple.com/tv/webos/` | Hosted URL opened by the LG launcher |

Set these environment variables on the build command. Public configuration is embedded; never put secrets in them. HTTPS is required except for local development.

For a local API:

```sh
TV_API_BASE_URL=http://localhost:4000 pnpm --filter @cinnetemple/tv build
```

Add `http://localhost:4173` to the **local backend's** `CORS_ORIGINS`. The production API does not currently allow this preview origin, so the default production-backed preview will fail CORS unless served from an allowed website origin. Do not broadly enable `null` or wildcard origins to sideload the app.

## Platform outputs

- `dist/webos/`: host under `/tv/webos/` on the configured website.
- `dist/vidaa/`: host under `/tv/vidaa/`; this HTTPS entry URL is the VIDAA app deliverable for partner onboarding/testing.
- `dist/webos-launcher/`: LG hosted-app shell. Host the corresponding website first, then package/install the shell.

The default hosted URLs are intended deployment locations, **not proof that those pages have been deployed**. Use the existing web deployment pipeline/CDN to serve these static files. On a different domain, explicitly add that exact HTTPS origin to the API CORS allowlist. Signed media URLs must be reachable by the TV with compatible HTTPS certificates and byte-range support.

With the official LG CLI installed:

```sh
ares-package apps/tv/dist/webos-launcher -o apps/tv/dist
ares-install --device YOUR_CONFIGURED_TV apps/tv/dist/com.cinnetemple.tv_0.1.0_all.ipk
ares-launch --device YOUR_CONFIGURED_TV com.cinnetemple.tv
```

Configure the TV through LG Developer Mode first. VIDAA distribution/test-device onboarding uses the vendor's partner process; this repository does not invent an APK/IPK or a sideload procedure for VIDAA. Store assets, accounts and vendor approval remain separate work.

## Compatibility

LG's 2020 webOS 5.x uses Chromium 68. The bundle targets Chromium 53 to avoid newer JavaScript syntax, with XHR transport and CSS without flex `gap`, `inset`, backdrop filters or remote fonts. VIDAA engines differ across chipsets/regions; a build target is not a hardware certification. The player uses the TV's native `<video>` pipeline for MP4/HLS supported by that set; no assumption is made that every device decodes every uploaded file. The supplied movie watermark is retained above video, but hardware video-plane composition also requires TV verification.

Back/Return stays within the app until the root, which offers an exit confirmation. Standard LG keys and common VIDAA/HTML media keycodes are mapped. TV software keyboards own text/cursor keys inside inputs; use Down to move between fields and buttons. Physical VIDAA 2020 remote key mappings, keyboard behavior and exit handling still require testing.

## Verification

```sh
pnpm --filter @cinnetemple/tv lint
pnpm --filter @cinnetemple/tv test
# Start the preview in another terminal; Google Chrome must be installed.
pnpm --filter @cinnetemple/tv test:browser
```

Browser tests intercept all API requests with fixtures and play the repository's local splash clip as sample media; they do not log into a real account or buy tickets. `PLAYWRIGHT_MODULE` can point to an absolute `playwright/index.mjs` in a separate tools installation. Test coverage includes refresh races/failures, navigation, tickets, watchlist, movie/episode authorization, actual sample-video playback and pause/progress reporting, media error handling, search, sign-out and outage recovery. A passing desktop browser test does not validate TV codecs, DRM, store approval or physical remote behavior.

Device checks before release: LG 2020 plus a recent model; VIDAA 2020 plus a recent model; D-pad-only completion of every screen; software keyboard; suspend/resume; stream seeking and final heartbeat; viewing expiry; ticket handoff; expired/revoked tokens; poor connection; HTTPS/CDN compatibility; aspect ratio at 720p/1080p/4K; captions/DRM requirements with content owners.

## Vendor references

- [LG web engines](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)
- [LG hosted web apps](https://webostv.developer.lge.com/develop/getting-started/web-app-types)
- [LG app metadata](https://webostv.developer.lge.com/develop/references/appinfo-json)
- [LG remote keys](https://webostv.developer.lge.com/develop/guides/magic-remote)
- [LG streaming formats](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm)
- [VIDAA partner/developer portal terms](https://www.vidaa.com/terms-and-conditions/)
