# Apple coin purchases — October 17, 2026

## Saved in App Store Connect

App: CinneTemple, Apple app ID `6792485351`, bundle ID `CinneTemple.CinneTemple`.

The user approved 1 coin = ₦1 and these four consumable products:

| Coins | Nigeria price | Product ID | Apple product ID |
| ---: | ---: | --- | --- |
| 500 | ₦500 | `com.cinnetemple.coins.500` | `6823899262` |
| 1,000 | ₦1,000 | `com.cinnetemple.coins.1000` | `6823899004` |
| 2,500 | ₦2,500 | `com.cinnetemple.coins.2500` | `6823899654` |
| 5,000 | ₦5,000 | `com.cinnetemple.coins.5000` | `6823900133` |

Each has an English (U.S.) display name/description, Nigeria base pricing and Nigeria-only availability. Exact ₦1,000 and ₦5,000 prices were selected from Apple's additional price points. All four are saved as **Prepare for Submission** drafts. They have not been submitted for review. Proof: `apple-coin-products-2026-10-17.jpg`.

## Confirmed coin usage

The user confirmed that Apple-purchased coins should work for both movie tickets and film funding. Keep the shared wallet; pool contributions debit it and pool returns credit it. The value remains 1 coin = ₦1; returns are coins, not a cash withdrawal feature.

## Implemented locally

- Profile → CinneTemple coins: balance, four StoreKit products, localized Apple prices, purchase and retry controls.
- Signed purchases use the signed-in user's UUID as `appAccountToken`. The backend verifies Apple's certificate chain, signature, bundle, environment, product, quantity, account and revocation state.
- `GET /v1/wallet/apple/products` supplies the allowlisted packs; `POST /v1/wallet/apple/confirm` credits the wallet. The client cannot choose how many coins a transaction grants.
- Top-up record, wallet balance and ledger entry are committed in one database transaction. Apple's transaction ID is unique. Replays and concurrent callbacks cannot credit twice.
- StoreKit transactions finish only after successful server credit. Unfinished purchases retry after sign-in, relaunch or the Retry purchases button. Transactions for another CinneTemple account remain unfinished until that account signs in.
- Movie tickets use `POST /v1/purchases/coins` with a stable request UUID. A wallet row lock, conditional debit and atomic entitlement creation prevent duplicate spending and negative balances. The movie detail page links to the wallet.
- The previous public `/v1/purchases/apple` ticket endpoint has been removed; it did not enforce a product-to-ticket mapping. Old direct-ticket StoreKit products are not used.
- Migration `20261017090000_coin_tickets` adds `COINS` payment provider and `TICKET_PURCHASE` ledger kind. Coin-funded ticket accounting uses the ticket's nominal value; the platform absorbs coin-acquisition fees, as it does payment-provider fees. Nominal wallet value is not Apple's net proceeds.

## Validation

- Backend TypeScript check passed.
- Full backend suite: 209 tests passed, including isolated PostgreSQL tests. A subsequent additional production/sandbox guard regression passed with the focused coin suite (9 tests).
- Twelve concurrent Apple confirmations created one top-up and one ledger entry.
- Simulated ledger failure rolled back the top-up, then a retry credited successfully.
- Eight concurrent ticket purchases created one paid purchase/entitlement and deducted one ticket price.
- Insufficient balance rolled back the purchase and entitlement.
- iOS simulator build and 13 regression tests passed.
- After the user confirmed shared coin usage, all five isolated PostgreSQL Apple-wallet tests passed, including a full credit → film contribution → coin return → movie ticket sequence and a ledger-to-balance reconciliation.
- No real Apple payment was made. Unit/integration transaction claims are fixtures after the verifier boundary; a genuine sandbox StoreKit purchase remains to be tested.

## Activation work still required

These backend/iOS changes are **not deployed**, and no new TestFlight build was uploaded in this turn.

1. Apply the migration and deploy the updated API to an isolated test environment. Use `APPLE_BUNDLE_ID=CinneTemple.CinneTemple`, `APPLE_APP_APPLE_ID=6792485351`, and `APPLE_IAP_ENVIRONMENT=Sandbox` there. TestFlight uses Apple's sandbox. The production-wallet endpoint rejects Sandbox credits to avoid turning free test purchases into transferable real wallet value. Do not switch the live wallet service to Sandbox.
2. Test cancellation, approval delays, app restart/network failure, account switching and each actual product through Apple's sandbox, using a build pointed at the isolated API.
3. Complete refund/revocation notification handling for the confirmed shared wallet before accepting real money. This turn rejects transactions already revoked when presented but does not implement post-credit refund notifications. Existing film-funding pools can pay returns in coins; The shared balance is the confirmed product choice. Apple acceptance remains unverified: guidelines 3.2.1(viii) address investing/financial services and 3.2.2(iv) restrict fundraising. Applicability to this coin-return model needs assessment before submission; the user’s choice is not evidence of Apple approval.
4. Paid Apps Agreement, bank account and both listed tax forms were verified Active in App Store Connect. No agreement was accepted or financial details changed.
5. Add genuine in-app review screenshots and submit these first consumable products with a new app version, as App Store Connect requires. Release builds use `APPLE_IAP_ENVIRONMENT=Production` on the API and require the numeric app ID.
6. Review the existing iOS gifting checkout separately before App Review; this change moves self-purchased movie tickets to coins, but does not migrate gifting to coins.

Apple references: [account-token binding](https://developer.apple.com/documentation/appstoreserverapi/appaccounttoken), [first-purchase submission](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase).

Policy reference checked October 17, 2026: https://developer.apple.com/app-store/review/guidelines/#other-business-model-issues
