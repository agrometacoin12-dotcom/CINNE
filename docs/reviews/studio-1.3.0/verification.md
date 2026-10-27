# Local video enhancement — Studio 1.3.0

17 October 2026. User selected local processing first.

The movie uploader now supports a native source picker, sample start offset, 10/30-second samples, before/after video players, synchronized-start playback, explicit sample approval, a save dialog for the full export, progress and cancellation, and selecting the exported MP4 for normal upload. Previewing never triggers full processing or upload. Original files and existing destination files are preserved. Jobs can be found again when reopening an editor within the same app session.

Processor: separate bundled FFmpeg executable; conventional hqdn3d denoising, Lanczos upscale and mild unsharp filtering, normalized pixel aspect ratio and letterboxed/pillarboxed 3840x2160 output. H.264/AAC, first video/audio tracks. Not AI enhancement. Native-resolution before samples are re-encoded for browser-compatible playback, rather than copied as a lossless original. Source/output files and samples remain local. Runtime processing disallows network input protocols.

Validation: TypeScript, Vite and Electron builds passed. Nine automated tests passed, including real FFmpeg generation of before/after clips and a full 3840x2160 export with audio, byte-for-byte preservation of the input, approval gate, ranged preview streaming, cancellation, and existing upload tests. Electron screenshot workflow verified actual decoded sample frames and the disabled/enabled full-process approval button. The fixture is a synthetic short test clip; no claim is made about enhancement quality for a real feature film.

Limits: CPU processing may take hours; requires free disk space and keeping Studio running. No resume after application exit. No AI detail recovery, subtitle preservation, multi-audio export, HDR mastering or automatic publishing. Existing backend upload limits and the current 1080p adaptive streaming ladder remain unchanged. The source download notices are bundled beside each standalone processor. Mac test builds are ad-hoc signed, not Apple notarized.

Apple Silicon packaging: bundled FFmpeg matched the pinned upstream download SHA-256 a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584 before ad-hoc signing. The packaged app passed deep signature validation and completed the real-sample UI approval workflow using its bundled processor (no external runtime override). DMG checksum verification passed.

Intel Mac: packaged app completed the real sample/approval UI checks under Rosetta with its x86_64 bundled processor. Windows x64 installer and portable packaging succeeded; execution on Windows hardware was not tested. Final packaging includes immediate worker cancellation before asynchronous shutdown cleanup. Full-export tests additionally verify existing destination files remain unchanged, HEAD/range serving, and invalid-range rejection.

Final release checks: all three packaged app archives contain the exact final main-process bundle; each includes its platform processor. Both final Mac app signatures passed deep/strict validation. Installer builds completed for Apple Silicon, Intel and Windows x64, with ZIP/portable alternatives.
