# Build 19: production identities and catalogue, simulated payments

Implemented on the existing main checkout. Production API: https://api.cinnetemple.com. Browser test wallet: https://www.cinnetemple.com/test/wallet/.

## Payment boundaries
- Existing production accounts and uploaded titles are reused.
- Korapay uses a server-side test-only key and dedicated KorapayTestTopup records. Only provider-verified paid references count as test credit.
- Test tickets debit sandbox spends, create MOCK purchases with amountMinor 0, and grant access to the selected actual title. Real wallet and monetary producer revenue remain separate.
- No migration of old isolated test accounts or balances.

## Verified
- Backend typecheck passed; full backend suite: 255 passed, 35 skipped (database integration cases).
- Seven new Korapay test-service cases cover credit replay, ownership, amount/currency, test key and webhook validation.
- Two additional ticket tests passed: confirmed Kora test credit unlocks an uploaded title without monetary revenue; insufficient credit does not grant access.
- Browser suite: 26 passed. iOS targeted regression tests: 2 passed.
- Build 19 device archive and simulator build succeeded. Archive Info.plist confirms production API and korapay-test mode.
- Existing production QA account signs in through API and simulator. Actual uploaded catalogue returned, including A CHINUA ACHEBE MOVIE and THE CINNETEMPLE CREW.
- Production test checkout initializes a 500-coin Korapay TEST payment. Real wallet remains zero.
- Backend deployment 67db7ce0-4921-4dc1-acb2-5a290b97c230 succeeded.
- Website deployment a81a3528-cec9-44bf-870d-b7a3867724ce succeeded. To avoid upload timeout, staging Dockerfile retrieves the unchanged 36 MB demo video from its current public URL with SHA256 verification; no application code difference.
- Diagnosed missing artwork as a stale backend storage secret. Synchronized existing bucket credential without rotation; redeployment 66eefba8-6c78-4b46-9e93-24a0ba5dee6d succeeded. Poster response verified HTTP 200 image/png.

## Final release verification
- Korapay simulated checkout completed and provider verified PAID. Three parallel re-verifications each returned the same balance of 500 (exactly one credit). A 400-coin ticket for A CHINUA ACHEBE MOVIE succeeded; test balance became 100, real balance remained 0 with no ledger entries. Playback returned HTTP 200 HLS and actual movie frames played in the iPhone simulator; timer advanced to 0:09. Evidence: playback.png. iOS Test wallet also displayed the remaining 100 coins. Database inspection confirmed one PAID MOCK purchase with amountMinor 0.
- After the user refreshed Xcode sign-in, build 19 upload succeeded at 09:51:59 Africa/Lagos on 2026-10-24. Apple processing completed. Build ID c77d7904-39d2-41b8-aa91-abfc4af06816 assigned to Public Beta, with automatic tester notification selected.
- Public Beta build list directly confirmed 1.0 (19) status Testing. Existing public link: https://testflight.apple.com/join/bf2wphb6. Evidence: testflight-public.png.

QA credentials and payment URLs remain only in protected temporary files; none are included in this report.
