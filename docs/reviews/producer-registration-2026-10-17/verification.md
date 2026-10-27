# Producer registration and uploader matching — 17 October 2026

Public registration: https://www.cinnetemple.com/producer/register/
Dashboard: https://www.cinnetemple.com/producer/

Producer signs in with Google, supplies a producer/company name if new, and shares their verified email with the operator. Studio 1.3.1 finds the producer by email, displays their name, and sends their stable ID with the movie assignment and operator-defined revenue percentage. Uploads are queued only after assignment succeeds. New producers initially see an empty dashboard; registering never lets a producer claim arbitrary movie IDs or change shares.

Existing producer rows, assignments, balances and private-link credentials are preserved when the verified owner registers. Account dashboard access resolves ownership from the database user identity, requiring an active, email-verified Google/Apple credential. Email/password auto-verification alone cannot claim a producer profile. Directory lookup stays admin-only. Legacy private dashboard URLs still display films and earnings. The new static dashboard displays withdrawal history; withdrawal initiation is not included in the new static dashboard.

## Verification

- Current workspace: 200 backend unit tests passed (22 integration tests skipped in that run).
- Dedicated local PostgreSQL: 24 producer tests passed, including real assignment, money/withdrawal calculations, and registration preserving existing titles/balance/private link.
- Isolated production-source release: TypeScript checks and Nest build passed; 177 tests passed against a separate migrated local PostgreSQL database. No production records were created for testing.
- Website: 16 tests passed, covering sign-in return paths, redirect rejection, profile registration, signed-out handling, and existing desktop login regression.
- Desktop: build and 9 tests passed. Mock UI driver verified lookup, selected producer, 82.5% share persistence and unchanged save avoiding a second assignment. See uploader.png.
- Live registration HTML matched local source byte-for-byte. Browser page rendered correctly and Continue with Google reached the real Google account chooser. No account was selected, and no real producer signup was submitted.
- Live health returned HTTP 200 with database up. Anonymous registration, dashboard and admin directory requests returned HTTP 401.

## Releases

Backend deployment: 79af0c56-836a-40eb-b16e-a4b2ef4fd30a — SUCCESS.
Website deployment: 9b640b8e-78ce-41c5-88b1-78b8c40e939e (final copy correction; initial verified deployment 83577722-8b9e-4f46-9968-52898ce87ae3).

The running backend source did not yet contain the producer module. The deployment was assembled from that actual running source at /tmp/ct-producer-release, adding the producer module, its additive 20260927000000_producers migration/schema, module wiring, plain-text mail helper, and private-key/code log redaction. The broader local coin/payment and playback changes were excluded. Website staging is /tmp/ct-producer-web-release.

Studio version: 1.3.1. Mac builds are ad-hoc signed, not Apple-notarized. Windows installers are packaged on macOS and have not been executed on Windows. Real-user OAuth completion and assignment notification email delivery were not tested with a producer account.

Installer verification: Mac ARM64 and Intel binaries have the expected architectures; both pass strict deep signature verification and DMG checksum verification. ARM ZIP, Intel app and Windows app package versions are 1.3.1 and their renderer bytes match the final tested build. Installers are in apps/desktop-admin/release/.
