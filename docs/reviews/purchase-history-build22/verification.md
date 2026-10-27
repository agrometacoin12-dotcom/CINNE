# Build 22 — purchase history and live wallet

Added authenticated GET /v1/wallet/purchases, scoped to the signed-in user, combining live coin top-ups with clearly labelled Apple and browser test transactions. Statuses include pending, paid, failed and refunded. The iOS purchase history lists coin purchases and movie tickets separately and refreshes when returning to the app.

The wallet defaults to live coins, including live browser credits, even on TestFlight. A verified sandbox App Store environment exposes a separate Test coins selection; ticket spending uses the selected balance. In-app purchasing remains Apple IAP. No gateway branding or external checkout is shown in iOS.

Validation: 27 backend tests passed, local backend build passed, 19 iOS tests passed for build 22, release archive succeeded. The selected test wallet is preserved during App Store metadata outages. Build 21 was superseded before public assignment. Tests cover owner-scoped history and status/environment mapping, decoding, live-wallet default and independent sandbox balance selection.

Backend deployment ca4eb850-c9f6-46b9-bedc-5dd0efa02074 succeeded. Authenticated history returned HTTP 200 and the expected live failed checkout plus paid/pending sandbox top-ups. Build 22 simulator rendered these records and the existing movie ticket under Profile → Purchase history; screenshot purchase-history.png.
Build 22 uploaded successfully at 13:47 Africa/Lagos on 26 October 2026. Processing completed; build 22 assigned to the external Public Beta group and verified Testing, with public link https://testflight.apple.com/join/bf2wphb6. Apple build ID: 1e3977f3-93d5-431a-9705-6e35da2c5d9c. Proof: testflight-public.png.
No fresh real-money or Apple sandbox purchase was performed in this turn.
