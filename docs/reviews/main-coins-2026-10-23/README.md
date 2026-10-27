# Main backend Apple coins — 23 October 2026

User authorized deploying coin purchases to main/production for all users. No email allowlist exists for packs. Pack IDs: com.cinnetemple.coins.500, .1000, .2500, .5000. Amounts are determined from the server catalogue, not client inputs.

Main Railway backend configured with APPLE_APP_APPLE_ID=6792485351, APPLE_BUNDLE_ID=CinneTemple.CinneTemple, APPLE_IAP_ENVIRONMENT=Production. Production coin settlement now requires explicitly verified Production transactions; missing, Xcode, and Sandbox environments are rejected before wallet writes.

Validation: backend typecheck/build passed; 223 existing/updated unit tests passed; two additional production-verifier tests passed using the real Apple verification library for a forged receipt; all migrations applied to a disposable local PostgreSQL database, then five settlement tests passed (12 concurrent confirmations, atomic rollback/retry, ticket spending, insufficient balance, shared funding balance). These are not actual Apple-paid transaction evidence.

Backend-only source package uploaded to Railway production: deployment 1bf548cb-13f0-42c9-982a-bb82fc0ba2ef. App binaries, uploader sources, local credentials, uploads and node_modules excluded. Main database migration/deployment status and live authenticated probes pending.

Apple live verification: App Store version 1.0 and all four coin products show Prepare for Submission. They are not approved for real-money distribution. Build 14 is TestFlight; its sandbox purchases cannot credit live spendable wallets. No App Store submission or approval was claimed or performed in this backend task.

## Verified deployment result

Railway deployment 1bf548cb-13f0-42c9-982a-bb82fc0ba2ef reached SUCCESS. Production startup applied 20260926000000_coin_funding, 20261017090000_coin_tickets, and 20261021090000_google_play_coins; all migrations succeeded.

Live ordinary-account probes passed: product discovery 200 with all four packs; wallet balance initially 0; forged signed purchase 401; wallet remained 0; unauthenticated confirmation 401; health 200 with database up. See live-checks.json. A synthetic no-funds verification account was created through the ordinary registration endpoint; its password is stored only in a mode-0600 file outside the repository, never in this report. No live funds or paid receipts were created. In total 225 unit tests and five local database integration tests passed. Local database container was stopped after checks.

Outstanding: app and all four products remain Prepare for Submission. A real Apple-paid transaction has not been verified. Refund/server-notification lifecycle coverage was not implemented by this deployment; current confirmation rejects transactions already marked revoked. This backend deployment is not an App Store release or proof of complete paid-purchase lifecycle readiness.
