# Main backend and iOS Google sign-in — 23 October 2026

User directs all future fixes to main/production, not the separate test backend. Current Git branch is main. No unrelated working-tree changes were deployed.

Production already has the iOS OAuth audience matching Info.plist. Reapplied GOOGLE_IOS_CLIENT_ID to Railway backend. Live native endpoint returned 401 Invalid Google ID token for an intentionally invalid diagnostic token, demonstrating enabled verification but not a successful real-device login.

Build 13 is immutable and points to the isolated API. Build 14 archived successfully pointing to https://api.cinnetemple.com; archive Info.plist verified bundle version 14 and matching GIDClientID. Upload underway.

Railway rejected redeploy of the October 18 image (canRedeploy=false). Restart requested instead. Production /v1/wallet/apple/products returned 404; coin launch is not complete. TestFlight sandbox purchases must not credit production balances.

Restart completed successfully for deployment 4b731a85-447d-4e3b-8546-b2a2cbf395d3. Post-restart health returned 200 with database up, and Google native endpoint returned the expected 401 for an invalid token. Real Google sign-in remains a device verification step.

Build 14 upload succeeded; Apple displayed Processing. Public distribution is pending processing.

Build 14 finished Apple processing. Updated Beta Review notes to distinguish main build 14 from isolated build 13 credentials. Submitted build 14 to Public Beta with automatic tester notification. Source project build number updated to 14; existing main API default preserved.

Final verified Apple state: build 14 Testing in Public Beta. Screenshot build-14-testing.png. Public link https://testflight.apple.com/join/bf2wphb6. Main backend restarted, not rebuilt; real device Google sign-in still requires confirmation.
