# Apple sandbox verification — 19 October 2026

Isolated Railway project `cinnetemple-iap-sandbox` (`c2f59b8d-e932-4758-8590-31c3fd3b68a9`). API: https://iap-api-production.up.railway.app. Railway's default environment is named production; runtime NODE_ENV is staging and Apple verification is Sandbox. Independent Postgres, Redis, JWT and media secrets; no live database or payment-provider credentials.

Backend deployment: `a71f46d4-dc32-4494-916f-88f3f7dc757a`.

## Verified
- API health 200; isolated account registration 201.
- Authenticated Apple product discovery returns the four approved consumables.
- Forged unsigned transaction rejected with HTTP 401; wallet remained zero.
- Nine settlement unit tests passed.
- Five integration tests passed inside the sandbox service against its real Postgres: concurrent credit idempotency, atomic rollback/retry, ticket concurrency, insufficient balance, and contribution/return/ticket reconciliation. These mock the Apple verification boundary and do NOT prove an Apple purchase.
- Fourteen iOS networking/storage regression tests passed on iPhone 17 Pro Max simulator.
- Build 11 archive succeeded and embedded sandbox API URL was inspected before export.
- Sandbox keychain and cache are now scoped separately from live credentials/cache. Test wallet is visibly labelled.
- StoreKit error handling reports verification failures and rechecks signed-in account after server preflight.

## Still required before live activation
- Real iPhone purchase test. Sandbox tester creation is complete and directly verified in App Store Connect (Nigeria).
- Verify all four Apple purchase sheets/products, cancellation, pending approval, interrupted confirmation/relaunch, account switching and no duplicate credit from real signed transactions.
- Real Apple-signed sandbox success is not yet verified.
- Implement and test refund/revocation notification reconciliation before real-money rollout.
- Live API has not been modified or activated for coin IAP by this deployment.

Apple tester form prepared for the user-provided email, Nigeria storefront. No password collected.

## Upload result
Build 1.0 (11) upload succeeded at 2026-10-19 11:39 local workstation time. Export option `testFlightInternalTestingOnly=true`; cannot be used for App Store or external beta distribution. Private internal group `IAP Sandbox` created with automatic distribution disabled (`a2ab4aea-5476-423f-8699-2ee5e74a187f`). Apple processing/group assignment and invitation remain pending at this snapshot.

Sandbox tester account creation verified directly in Apple Users and Access. TestFlight invitation address confirmation requested separately because sandbox and TestFlight Apple accounts differ.

## Private TestFlight activation
User explicitly authorized invitation to ogbanogban50@icloud.com. Added that existing internal account to IAP Sandbox, selected only build 1.0 (11), and verified group reports 1 tester, 1 build with status Testing. Build 11 is processed and ready for internal testing; actual device installation and purchase remain unverified.
