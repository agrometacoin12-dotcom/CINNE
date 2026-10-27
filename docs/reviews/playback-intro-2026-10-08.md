# Playback intro — 2026-10-08

Implemented locally for iOS, Android, web, LG webOS and Hisense VIDAA.

## Behavior

- Opening a movie or episode starts the existing splash video while authorization and movie preparation run in parallel. Trailers do not use this intro.
- The movie remains paused underneath the intro, preserving its opening and resume position. Playback progress is not reported before the movie starts.
- The existing clip lasts approximately 4.05 seconds. It finishes naturally, with a five-second timeout to prevent a stalled intro from blocking playback.
- Viewers can skip the intro. Reduced-motion settings, intro failures and background transitions also allow it to finish safely.
- Movie playback starts automatically when the intro has finished and the app is in the foreground. Web and TV intros are muted to support browser autoplay; the player retains a manual Play fallback if movie autoplay is rejected.
- TV Back cancels the pending playback start, including while authorization is still loading.
- The portrait splash asset is fitted within the screen to preserve its artwork.

This masks preparation time; it does not guarantee the movie is ready within five seconds. Slow connections or authorization can still cause buffering afterward. No uploaded movie files are modified.

## Verification

- Android: debug build, lint and 16 unit tests passed.
- iOS: simulator build and 13 tests passed, including a regression check that a prepared, paused movie does not submit playback progress. Updated build installed on the iPhone 17 Pro Max simulator.
- Web: TypeScript check and fixture-based browser smoke test passed. Verified movie stays paused during the intro, no early progress heartbeat, and Skip hands off to the movie.
- TV: both target builds, syntax checks, 12 unit tests and fixture-based browser smoke tests passed. Verified natural intro completion, movie handoff, Back cancellation and existing player/navigation flows for both platforms.
- Whitespace validation passed.

Physical phones and TVs have not been tested. Browser tests use local fixtures, so they do not establish production startup latency.

## TestFlight upload

At the user's request, a signed iOS Release archive (version 1.0, archive build 6) was created and uploaded to App Store Connect on October 8, 2026. Xcode reported `Upload succeeded` and `EXPORT SUCCEEDED` at 01:02 WAT. Apple's last reported state was `Uploaded package is processing`; availability to testers is not yet verified. Automatic build-number management was enabled for the upload.

The archive is `/tmp/cinnetemple-testflight-20261008/CinneTemple.xcarchive`; the upload log is `/tmp/cinnetemple-testflight-upload.log`. No public App Store release or backend, Android, web or TV deployment was performed.
