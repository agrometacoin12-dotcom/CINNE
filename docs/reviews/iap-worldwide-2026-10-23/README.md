# Worldwide coin packs — 23 October 2026

## iOS changes
Apple product discovery now requests all four known product IDs directly from StoreKit, independently of backend wallet availability. The purchase path retains backend product preflight, account binding, verified JWS submission, and finish-after-credit behaviour.

The wallet always lists pack sizes, with disabled unavailable/loading rows until Apple returns real localized prices. No fabricated price or purchase button is enabled for missing Apple products. Product-loading errors and balance errors are displayed separately. Reload and foreground refresh retry StoreKit discovery.

## Validation
- 16 iOS networking regression tests passed, including Apple discovery despite backend failure and separate StoreKit versus wallet errors.
- Build 1.0 (12) archive succeeded.
- Archive Info.plist verified: build 12, API https://iap-api-production.up.railway.app.
- Export restricted to internal TestFlight, preserving isolated sandbox balances.
- Real device product retrieval and Apple purchase settlement are still pending; automated tests do not establish either.

## Apple configuration
Availability updated to all 175 storefronts and future regions for each approved coin pack. Nigeria remains the base pricing country and Apple's existing worldwide localized pricing schedule is retained. Product drafts are not submitted for App Store review by this task.

## Remaining checks
Verify upload completion and build processing; assign build 12 to IAP Sandbox. On device verify localized prices, cancelled payment, successful 500-coin purchase, one credit on retry/relaunch, then the other packs. Production activation remains separate.

Ordinary newly registered sandbox user (not the named tester email) successfully retrieved all four packs from the authenticated API. Apple Save confirmation was observed for 500, 1000, 2500 and 5000; the 1000 setting was additionally verified after reload. Screenshots accompany this record.

Upload completed successfully: build 1.0 (12), Apple returned “Uploaded package is processing” and “Upload succeeded”. No App Store release was submitted.

Apple TestFlight UI directly confirmed build 12 Processing in Build Uploads. Group activation awaits processing. No real sandbox purchase or device price-loading success is claimed.

## TestFlight activation verified
On 23 October 2026, Apple showed build 1.0 (12), build ID a40e2c80-d60e-4b34-8c78-cbdb2643993f, Ready to Test. Added it to the existing IAP Sandbox internal group. The build row then showed Testing and IAP Sandbox. Screenshot: build-12-testing.png. Device installation and purchase confirmation remain pending.
