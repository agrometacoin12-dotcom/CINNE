# Shared wallet and Korapay checkout — 24 October 2026

Browser: https://www.cinnetemple.com/wallet/
API: https://api.cinnetemple.com/v1

The website uses the existing account and live coin ledger. iOS checkout remains Apple IAP only, with no external payment button. No reviewer-specific hiding or bypass is implemented.

## Activation

Backend service variables:
- PAYMENT_DRIVER=korapay
- KORAPAY_SECRET_KEY: supply the merchant's live key privately in Railway.
- KORAPAY_WEBHOOK_URL=https://api.cinnetemple.com/v1/payments/webhook (default)

Checkout fails closed without a live key in production. Mock/test payments cannot credit production wallets. Merchant bears Kora fees; packs of 500/1000/2500/5000 cost NGN500/1000/2500/5000. No real charge has been performed.

Kora initialization and verification are server-side. Amounts convert from naira into integer kobo. Verification matches the merchant reference, accepted amount and currency. Signed webhooks also query Kora before settlement; duplicate callback/webhook deliveries settle once. Amount mismatches require support reconciliation and never silently credit the selected pack.

Official references:
- https://developers.korapay.com/docs/checkout-redirect
- https://developers.korapay.com/docs/webhooks
- https://docs.korapay.com/

## Apple sandbox ticket fix

Wallet balance and movie ticket purchase now use the same explicitly selected environment. Failure to verify the App Store environment fails clearly instead of silently selecting live funds. Sandbox purchases remain in separate tables, and sandbox tickets expire after 24 hours with zero producer revenue. Existing older builds may still choose the wrong ticket endpoint; build 16 contains the client correction.

User reported Apple coin confirmation now works. A real device movie-ticket retest remains necessary. No real Apple receipt or refund was fabricated.

## Validation

282 backend tests, including real local PostgreSQL concurrency/refund/sandbox tests and Korapay verification tests, passed. 22 browser logic tests passed. Backend typecheck passed. Native ON CONFLICT wallet initialization fixes a race discovered when concurrent transfers first credit the same recipient.

## Release evidence

- Build 16 processed and was assigned to IAP Sandbox and Public Beta. App Store Connect now shows build 1.0 (16) as Testing in Public Beta; this is TestFlight availability, not App Store release approval. Evidence: build16-testing.png.
- iOS simulator regression `testTicketPurchaseUsesExplicitWalletEnvironment` passed, confirming separate live and sandbox ticket endpoints.
- Website deployment `19cb1c99-7e13-416d-9d58-aa8ab7ff5282` succeeded.
- Final Korapay backend deployment `6a44bac2-8c5f-44c1-9cb1-675cebcdf2a4` succeeded. Main health reports database up; checkout identifies KORAPAY and remains disabled without its live key. Disabled top-up returns 503, forged Apple and gateway requests return 401, and the QA wallet remains unchanged.
- Browser sign-in with the existing synthetic QA account loaded the live balance and all four disabled packs. Missing-key checkout returns HTTP 503; no balance is credited.
- A real gateway charge and real-device sandbox movie purchase remain unverified.

## Wallet design update

The live wallet now uses a light background, focused sign-in card, dark balance card, and four clear coin-pack cards. Signed-in and signed-out states were visually checked on the live website; sign-in and sign-out both worked. All 22 browser tests passed again and git diff --check passed. Screenshots: signin-redesign.png and wallet-redesign.png. The redesign deployment was 937ba0bb-71e2-4f75-a4f4-dc0956861046; the published design was verified in the browser. Top-ups remain disabled until the Korapay live key is configured.

## Cinema reference design

Applied the user's gold-and-dark cinema reference to the wallet header, balance card, coin-pack buttons and activity panel. Added an optimized 241 KB generated film-reel background and CSS coin artwork. The mobile stylesheet uses two columns; desktop uses four. All 22 browser tests and JavaScript syntax validation passed. Railway deployment 2071683c-1d6a-46a8-9a1f-951236a3599c reached SUCCESS. The live signed-in page was visually verified with four disabled packs and the missing-key notice. Evidence: wallet-cinema-gold.png. No payment was attempted.

## Korapay test checkout activated

Test page: https://www.cinnetemple.com/test/wallet/

The existing isolated project cinnetemple-iap-sandbox runs the current main backend source with NODE_ENV=staging, independent Postgres/JWT, PAYMENT_DRIVER=korapay and an existing sk_test credential. The credential was transferred to this service with explicit user consent, not printed or added to the live backend. WEB_BASE_URL points to https://www.cinnetemple.com/test, so callbacks return to /test/wallet/callback. User completed Korapay OTP; dashboard confirmed the isolated /v1/payments/webhook URL was saved.

Backend b4ba8b33-3395-4917-bb3f-27959cd61a43 and website 58c66eb2-db83-414a-87c6-765405208514 both reached SUCCESS. Browser storage keys isolate test tokens and pending payments. Test checkout hosts are permitted only for test mode/test credentials. 25 browser tests, 16 payment-driver tests and backend typecheck passed.

On Korapay's explicitly labelled TEST MODE checkout, selected Success (no authentication) and completed the simulated NGN500 payment. Automatic return showed 500 test coins credited. After refresh the balance remained 500 with one TOPUP entry. Read-only database verification confirmed one PAID KORAPAY top-up (coin_10663ef74c004c258658ba3bf4523340), balance 500, and exactly one TOPUP ledger row. The same email's live wallet remained 0 with checkout disabled. No real money was charged. Evidence: korapay-test-wallet-500.png and korapay-test-webhook.png. This does not constitute a live gateway payment test or Korapay KYC approval.
