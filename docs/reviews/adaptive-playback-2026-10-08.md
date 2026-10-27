# Adaptive playback implementation and rollout

## Implemented

- The authorized start response includes the current movie/episode's `resumeSeconds`. Movie progress older than the current ticket is ignored. Android no longer requests the entire Continue Watching rail on updated servers; its legacy fallback remains for older backends. iOS prefers the server's resume position.
- Native clients request `?format=hls`. Older clients keep original-file delivery; older backends ignore the optional query. A missing or incomplete rendition falls back to the original source.
- The encoder produces H.264/AAC MPEG-TS HLS, four-second independent segments, and 360p/720p/1080p variants when the source resolution allows. It preserves source frame rates up to 30 fps, uses even dimensions, avoids upscaling, and supports silent sources. Multi-audio, embedded-subtitle and HDR sources are rejected by this initial profile, retaining original-file playback rather than silently dropping tracks or damaging color. The worker remembers these source fingerprints until restart and retries if the source changes.
- Immutable rendition files are published before an atomic `ready.json` switch. Failed encoding leaves the previous rendition available. Original files are never replaced. Source fingerprints prevent republishing unchanged uploads and detect replacement during encoding.
- All manifests and segments require signed access. API manifests rewrite every child URI. CDN playback uses a policy limited to one encoded build; preparation receives an exact-file segment token. Without CDN signing configuration, protected API/storage delivery remains available.
- The original publishing Lambda now copies only artwork. CloudFront's HLS and legacy video paths require a trusted key group, or return 403 when no key exists. Public images retain their existing behavior.
- Preparation checks entitlement and premiere/episode restrictions without opening a ticket window. It returns only the opening segment from the smallest rendition, with a two-minute expiry. Both native apps prepare silently while the movie detail page is visible; Android requires an unmetered network, and iOS disallows cellular, expensive and constrained video fetches. Preparation is released on navigation/backgrounding. The normal start endpoint still authorizes Play. Preparation is currently movie-only in the UI.
- Raw immutable playlists use an 8 MiB bounded server cache. CDN signatures are generated once per playlist/build policy, avoiding thousands of RSA signatures during startup.
- The Docker runtime includes FFmpeg/FFprobe. CDK can provision an isolated encoder worker (4 vCPU, 8 GiB RAM, 100 GiB temporary disk), separate from the API.

This is implemented and verified locally. Production has not been deployed, existing production films have not been encoded, and CloudFront signing credentials have not been configured in a live environment.

## Enable safely

1. Deploy the protected CDN behaviors before putting any HLS objects in its delivery bucket. Keep source and delivery buckets private. Audit existing absolute, unsigned CDN video URLs before rollout; those legacy URLs will be rejected by the protected behaviors. Normal stored-object-key playback remains supported.
2. Configure the backend/worker with the existing source-storage credentials and `MEDIA_HLS_BUCKET` for private outputs. The API needs read access to HLS outputs; the worker needs source reads, output reads/writes and listing. With local storage, API and worker need the same `MEDIA_UPLOADS_DIR` volume.
3. Use an HTTPS `API_PUBLIC_URL` reachable by mobile clients. CDK now supplies the API domain/load-balancer URL rather than letting generated media URLs default to localhost. Native production clients need HTTPS.
4. Configure a CloudFront public key/trusted key group. Supply `MEDIA_HLS_CDN_URL`, `MEDIA_HLS_KEY_PAIR_ID` and the matching PEM `MEDIA_HLS_PRIVATE_KEY` to the backend through the deployment secret manager. The signing key must never be committed. Do not point these settings at a public, unsigned distribution.
5. Start the encoder separately and backfill existing objects. Enable `MEDIA_HLS_ENABLED=true` after the delivery path is configured. The original-file fallback handles titles still in the queue. Restart the API after changing environment settings.
6. Release the rebuilt native apps. Verify tap-to-first-frame and rebuffering on physical devices and representative mobile networks. No zero-latency claim is made by these tests.

For AWS CDK, use `mediaSigningPublicKeyPem` context for the **public** PEM and `mediaSigningPrivateKeySecretArn` for an existing secret containing the matching private PEM. `enableHlsWorker=true` enables the dedicated worker; it is opt-in to avoid silently adding a continuous encoding bill. CDK outputs the public key ID and HLS bucket name. Without the key/secret pair, the API uses signed storage delivery rather than the CDN.

For the existing Railway/S3-compatible setup, run a separate worker service from the same backend image, override its command, and share the storage environment. Do not run the encoder in an API request or as a second background process inside the API container.

From the repository root:

```sh
# FFmpeg and FFprobe must be on PATH (included in the Docker runtime).
pnpm --filter @cinnetemple/backend media:encode originals/video/OBJECT_ID.mp4
pnpm --filter @cinnetemple/backend media:encode --all

# Dedicated worker: sequential processing; rescans for new uploads every minute.
pnpm --filter @cinnetemple/backend media:encode --watch
```

Worker container command (working directory `/app/apps/backend`):

```sh
node_modules/.bin/ts-node --transpile-only scripts/encode-hls.ts --watch
```

Run a single worker. Interrupted uploads can leave unreferenced build objects; retain active builds and plan cleanup of unreferenced builds separately. Encoding needs enough temporary disk for the source plus outputs. The current encoder does not add DRM; signed URLs remain bearer credentials, alongside the app's existing watermark and capture protections.

## Verified

- Backend and worker TypeScript checks passed; **180 backend tests passed**, with 17 existing integration tests skipped.
- Android debug build, lint (zero errors), and **16 tests passed**.
- iOS simulator build and **12 tests passed**.
- The **two new CDN security tests passed**. The broader CDK suite has one unrelated existing failure: `test/stacks.test.ts` expects a 12-character Cognito password minimum while the unchanged `auth-stack.ts` configures 8.
- Infrastructure typecheck passed. Offline synthesis with fixture availability zones and the worker enabled passed; the generated template contains the separate worker, command and resource allocation. No AWS deployment was performed.
- A generated nine-second audiovisual source encoded to 360p and 720p; a silent portrait source encoded successfully. A multi-audio source was rejected without publishing a rendition. Re-running an unchanged source skipped encoding. A corrupt replacement failed without changing the published marker.
- Real FFprobe/FFmpeg decoding through the signed local HTTP routes passed: the full playlist exposed nine seconds; preparation exposed only four seconds.
- Tests cover missing/expired/tampered signatures, preparation-to-full-playback escalation, cross-file and cross-viewer tampering, unsafe playlist paths, byte ranges, original-file fallback, CDN policy scope and fresh-ticket resume reset.
- `git diff --check` passed.

Production S3/CloudFront playback, native physical-device startup timings, release provisioning, and LG webOS/Hisense VIDAA HLS certification remain unverified. Web and TV clients retain their existing original-file path until separately enabled and tested for adaptive playback.
