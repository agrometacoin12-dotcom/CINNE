# Build 20: Apple purchase UI with shared wallet

Removed the Korapay-only iOS mode, its runtime configuration, and all provider-specific wording/routes from the iOS target. The wallet always offers the four Apple StoreKit consumable packs. Transaction delivery, server confirmation before finishing, app-account binding and unfinished transaction recovery remain enabled. Returning to the active wallet refreshes the balance.

No backend deployment was necessary: deployed main backend already combines confirmed Apple sandbox credits and paid Korapay test top-ups in the same sandbox summary; production Apple and live browser credits use CoinWallet. Test and real funds remain separate. Live Korapay checkout is still disabled pending live configuration.

Validation:
- 18 iOS networking/regression tests passed, including Apple discovery alongside shared test balance and discovery during backend outage.
- 24 targeted backend tests passed, including combined balance, ownership, idempotent credit, signature rejection, and zero-value test tickets.
- Live API returned four Apple products and matching app-facing/browser test balances of 100.
- Build 20 archive succeeded: API https://api.cinnetemple.com, no COIN_WALLET_MODE override.
- Simulator lacks an Apple account, so these tests do not represent a fresh Apple sandbox payment. A real TestFlight Apple purchase remains a device verification step.

Release status: uploaded successfully, processing complete, assigned to Public Beta and verified Testing on 2026-10-24. Build ID: 253ea5fa-831b-4f0c-acf3-fbae6cc3f3a5. Public link: https://testflight.apple.com/join/bf2wphb6. Proof: testflight-public.png. Fresh Apple device purchase remains unverified.
