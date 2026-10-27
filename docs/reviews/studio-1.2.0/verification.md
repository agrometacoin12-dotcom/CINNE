# CinneTemple Studio 1.2.0

Implemented 17 October 2026.

- Redesigned movie workspace with editable metadata, file selection before creation, artwork thumbnails and a live approximate mobile preview.
- Producer name, email and revenue share use the existing authenticated producer endpoints. New/changed details trigger the backend dashboard-link email; unchanged saves do not rotate links. Explicit resend is available. Assignment/email errors remain visible without undoing a successful movie save.
- Files stream directly to storage. Multipart uploads use up to three concurrent parts per file, retry individual parts up to three attempts, and verify stored size before attaching the key. Cancellation aborts active parts. Attachment retries reuse the verified object within the current app session.
- Background attachment callbacks update the movie list without reopening a closed editor.

Validation: TypeScript and renderer/Electron builds pass. Seven upload regression tests pass (`npm test` in apps/desktop-admin). Electron mock-mode UI checks exercise producer assignment at 82.5%, persisted basis points, and unchanged-save behavior; screenshots inspected. Windows x64 installer and portable packaging succeeded.

Limits: UI checks ran on macOS Electron with mock data. Windows execution, production uploads and real producer email delivery were not tested in this change. No live producer emails were sent. Uploads are held in memory and require the app to remain open; resume after restart is not supported. Actual speed depends on network/storage throughput. The existing production backend must expose the producer endpoints and have mail delivery configured. No backend deployment is included in this desktop release.
