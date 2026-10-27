# Playback startup investigation and first improvements

## Findings from the code

Android's watch screen performed title detail, the full Continue Watching lookup, and playback authorization sequentially before constructing ExoPlayer. The history endpoint can itself perform title and entitlement lookups for multiple entries. Artwork is not needed to authorize or prepare video.

iOS's title page loaded title detail, then watchlist, then playback access sequentially. That delayed availability of the correct Play action. Its actual watch screen already sends the start request directly.

The default media path delivers the uploaded object using HTTP Range requests. Object storage delivery first verifies the signed app URL, makes a storage HEAD request, signs the storage URL, and redirects. No upload-time adaptive encoding or MP4 fast-start normalization pipeline was found. External video URLs can bypass this path; production encoding and actual network timings have not been inspected.

## Implemented

- Android loads artwork independently of playback. Authorization and resume lookup run concurrently, retaining the existing saved-position behavior. Denied authorization and leaving the screen cancel pending work.
- Android prepares the video at its saved position, including stream URL recovery, rather than preparing at zero and then issuing an immediate seek.
- iOS fetches title, watchlist and access status concurrently, updating each as it arrives. Cancelled title-page loads do not publish stale results.
- Authorization still occurs only after Play. The watch-once window must not be opened speculatively while browsing.

These changes remove known unnecessary waiting; they are not a measured claim about production time to first frame. Android still waits for resume history when it is slower than authorization, to preserve the viewer's position.

## Regression checks

Four new Android tests cover overlapping requests with a preserved resume point, unavailable history, immediate authorization denial, and cancellation of both requests. Virtual time verifies that a 300 ms authorization and 700 ms resume lookup complete in 700 ms rather than 1000 ms (excluding video buffering).

One new iOS test verifies that access status arrives before deliberately delayed title/watchlist responses, and that optional metadata failure does not remove access state.

Validation passed: Android debug build, lint (zero errors), and all 13 tests; iOS simulator build and all 11 tests. `git diff --check` passed. These include the previous bug-fix regressions.

## Implementation follow-up

The resume response, adaptive delivery and bounded preparation steps were implemented in the next pass. See [adaptive playback rollout and validation](adaptive-playback-2026-10-08.md). The list below records the original proposed next steps.

## Next improvements for near-instant playback

1. Measure tap-to-authorization, authorization-to-first-byte, and first-byte-to-first-frame on physical Android/iOS devices, with cold and warm connections. Track stalls alongside startup latency.
2. Return the current title's resume position in the authorized start response rather than fetching the entire Continue Watching rail.
3. Inspect actual MP4 files. If metadata is at the end, normalize with FFmpeg `-movflags +faststart` during ingestion, retaining the source. Do not replace live media blindly. [FFmpeg documentation](https://www.ffmpeg.org/ffmpeg-formats.html).
4. Add adaptive HLS renditions and protected CDN delivery, with a small initial rendition and independent segments. This requires encoding existing uploads and protecting manifests and every segment, including LG/VIDAA compatibility validation. [Apple HLS documentation](https://developer.apple.com/streaming/).
5. Add a separate authorized, non-consuming preparation mechanism before preloading protected video on the detail screen. Reuse the warmed player when Play is tapped; bound preload bytes and respect cellular/data-saving preferences. Never use the existing start endpoint for speculative preload because it opens the single-view window.

Do not force a zero buffer to make startup look faster: it can increase stalls. [Apple buffering guidance](https://developer.apple.com/documentation/avfoundation/avplayeritem/preferredforwardbufferduration).
