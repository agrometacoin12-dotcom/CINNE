# Studio 1.3.4 — Live coin top-up history

Added an admin-only GET /v1/admin/coin-topups endpoint and a dedicated Coin top-ups sidebar screen. Lists buyer name/email, purchased coin quantity, credited/refunded/not-credited state, amount, provider, payment status, reference, and payment/creation date. Supports buyer/reference search, bounded server pagination, all payment statuses and manual refresh. Uses live CoinTopup records, excludes MOCK providers and never queries the separate sandbox tables. No payment or balance mutations are added. Existing movie-ticket history remains separate.

Validation: Studio typecheck, renderer/Electron builds and backend build passed. Seventeen admin tests passed, covering projection of payment data without private user fields, non-mock filtering, matching count/list searches, status validation and pagination limits.

Production deployment: 07d849de-bf5c-4ed6-bb63-633512155dda; SUCCESS; health reports ok/database up. The live admin endpoint rejects unauthenticated requests with 401. The new service query against production returns exactly one PAID Paystack top-up for agrometacoin12@gmail.com: 500 coins, NGN 50000 minor units.

Studio 1.3.4 is installed at /Applications/CinneTemple Studio.app and the prior version was moved to Trash. Sidebar entry verified in the running app. The user began editing a new movie, so navigation to the new table was deferred to preserve their unsaved form. The running user session is retained. All 13 Studio regression tests passed. A fresh non-incremental backend compilation also passed.
