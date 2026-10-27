# CinneTemple Studio for macOS

17 October 2026. Same version 1.2.0 renderer and upload/producer functionality as Windows.

Apple Silicon package: build/typecheck passed, seven upload tests passed, packaged `.app` launched directly and completed the mock screenshot/producer-assignment workflow. Screenshots visually inspected. `codesign --verify --deep --strict` passed. DMG checksum validation passed.

The app is ad-hoc signed for local testing, not Developer ID signed or Apple notarized. No suitable Developer ID Application identity was installed. Public distribution requires that signing identity and notarization. No real producer emails, live uploads, or production deployments were performed during verification.

Build configuration also targets Intel x64. Architecture-specific artifacts use distinct filenames. Local signing is opt-in through `STUDIO_ADHOC_SIGN=1`; it does not change Windows signing or override Developer ID signing for normal release builds.

Intel x64 DMG and ZIP also built successfully. The x86_64 app passed deep/strict signature verification and completed the same mock UI/producer workflow under Rosetta on the Apple Silicon host. The Intel DMG checksum is valid. Testing on physical Intel hardware was not performed.
