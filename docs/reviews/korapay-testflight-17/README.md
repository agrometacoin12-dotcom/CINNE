# Korapay test wallet — iOS build 17

Build from main, isolated API https://iap-api-production.up.railway.app.
Build settings: API_BASE_URL=https://iap-api-production.up.railway.app COIN_WALLET_MODE=korapay-test.
Default project configuration remains Apple IAP against the main API. Explicit test mode requires the isolated hostname and bypasses StoreKit discovery/delivery. The shared isolated wallet and ticket route are used even with a TestFlight sandbox receipt. Account persistence is separated from the live app.

Test film: Big Buck Bunny — Test Movie, ID b17b0000-0000-4000-8000-000000000001, 100 coins. Complete Blender Foundation film, original credits retained, CC BY 3.0 attribution in description and /test/media/LICENSE.txt. Full film re-encoded H.264/AAC with faststart, artwork extracted from the film.

Validation:
- Two simulator regressions passed: explicit ticket environment routing and Korapay wallet without StoreKit product discovery.
- Release archive succeeded; embedded build 17, isolated API and korapay-test mode verified before upload.
- Isolated QA fixture account: 500 -> 400 after ticket purchase; identical request replay stayed at 400; playback authorized. See ticket-check.json. The initial QA credit was an audited fixture, not a provider payment. The user's separate Korapay test checkout and 500-coin credit were verified previously and were not spent by QA.
- Website media deployment d81ffd35-3df8-4e83-9d62-2835a756edcb SUCCESS; live MP4 returns 206 and byte ranges for seeking, 37,990,007 bytes.

Tester steps: install 1.0 (17), sign in using the same email and password as https://www.cinnetemple.com/test/wallet/, open the test film and buy a 100-coin ticket. The user's physical iPhone run remains to be confirmed.
- Native simulator manual check: signed into QA account, wallet displayed 400 coins, test film played with advancing elapsed time and rendered video. Then simulated completion of that QA ticket through the normal progress API, bought a second 100-coin ticket using the native Get ticket button, observed automatic playback and confirmed balance 300. Screenshots saved alongside this report.
- Apple upload accepted at 06:47 Lagos time; build 17 finished processing and reached Ready to Test. Uploaded as internal testing only.
- Final Apple state: 1.0 (17) Internal is Testing in IAP Sandbox. What to Test instructions saved. Group contains ogbanogban50@icloud.com, currently Invited; tester must accept that internal invitation to install. Public Beta remains on its existing production build. Build ID 29f5f82e-2334-4c70-ab2d-986ef4dc4d8e. See testflight-testing.png.
