# Mobile bug fixes — 2026-10-07

Follow-up to the Android/iOS review of `74af6be`. All six reported defects have been addressed in the working tree.

## Changes

- **iOS session retention:** Refresh now throws transient errors instead of signing out. Startup retains credentials on connection failures, throttling, server errors, and malformed responses. A cached user can browse offline; without cached data, the viewer gets retry/sign-out controls. A rejected refresh clears local state without recursively invoking authenticated logout.
- **Android session retention:** The authenticator propagates refresh transport/unexpected-response failures instead of returning the original `/me` 401. Only refresh 401/403 invalidate credentials. Startup offers retry controls after temporary failures. Malformed token responses become recoverable IO failures.
- **Session concurrency:** Both apps prevent an in-flight refresh from restoring credentials after logout or overwriting a newer login. Concurrent requests share/reuse token rotation. HTTP response status takes precedence over contradictory problem-JSON status. Logout captures its original credentials and avoids refresh recursion.
- **Android audio:** Movie and trailer players use media/movie audio attributes, automatic Media3 audio-focus handling, and pause-on-headphone-disconnect handling.
- **iOS query encoding:** Search uses URL query items; ampersands, literal plus signs, Unicode, and fragment characters stay within the search value. Checkout verification now uses the same injected API client and refresh/query handling.
- **Android splash:** Uses TextureView for composited opacity on older Android releases; fixes the alpha name collision. Completion is idempotent and pauses playback, including when the app backgrounds.
- **iOS splash:** Uses a view-scoped notification subscription and cancellable timeout. Completion pauses playback; disappearance releases the current item and player layer. Backgrounding and Reduce Motion changes finish the splash.

## Regression coverage

**iOS: 10 XCTest tests**, using an ephemeral URLSession fixture, isolated real Keychain services, and temporary offline caches:

- 429/500/503/404 refresh errors retain credentials and allow retry.
- Offline refresh preserves the cached user.
- Malformed refresh responses retain credentials.
- Rejected refresh clears the session without a recursive logout request.
- Concurrent and delayed 401 responses cause one rotation.
- Logout and a new login invalidate stale refresh results.
- Actual HTTP status overrides misleading JSON.
- Search preserves reserved characters and Unicode.
- Checkout uses the injected client and preserves the reference query.

**Android: 9 JUnit/Robolectric tests**, using real DataStore, OkHttp/Retrofit, and MockWebServer:

- Temporary refresh failures preserve tokens and permit recovery.
- Malformed/empty token responses remain recoverable.
- Rejected refresh clears the session without logout recursion.
- Misleading problem-JSON status cannot turn a 503 into a sign-out.
- Simultaneous 401 requests rotate once.
- Logout/new-login races cannot resurrect or overwrite credentials.
- Splash XML creates a TextureView without player controls.
- Movie playback uses media/movie audio attributes.

## Reproduction

Android requires Java 17 and the Android SDK. Run from `apps/android`:

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:lintDebug --console=plain
```

For iOS, select an installed simulator and run from the repository root:

```sh
xcodebuild -project apps/ios/CinneTemple.xcodeproj -scheme CinneTemple \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' \
  -configuration Debug CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES test
```

Local simulator signing is necessary for real Keychain test storage. Disabling signing compiled successfully but made the initial Keychain tests fail; the signed run passed.

## Verification limits

The iOS simulator build and 10 tests passed. Android debug assembly, 9 tests, and lint passed with zero lint errors. Existing dependency/deprecation/style warnings remain. `git diff --check` passed.

These checks do not certify every device or prove the entire app bug-free. Physical-device checks remain for competing audio apps, incoming calls, headphone disconnection, splash fade/skip/background behavior, and release provisioning. No production accounts, purchases, deployments, or store submissions were used. The earlier LG webOS and Hisense VIDAA build work is separate from this mobile fix pass.
