# MKV preparation for Studio 1.3.3

The backend intentionally does not accept raw MKV for direct playback. The existing local FFmpeg processor reads Matroska but previously required 4K enhancement to export a whole movie.

Added a separate local Convert to MP4 for upload action. It converts the selected movie to H.264 / AAC progressive-download MP4 with fast-start metadata, normalizes pixel aspect ratio and even dimensions, and does not denoise, sharpen or upscale to 4K. Uses the first video and audio tracks; the UI explicitly states that extra audio and embedded subtitle tracks are omitted. The original and existing output files cannot be overwritten. Progress and cancellation reuse the local processing controls. Select the resulting MP4 in the same panel, then save/upload normally. No production database or backend change is required.

Validation: renderer typecheck, Vite production build and Electron build passed. All 13 Studio tests passed, including a real MKV fixture with FLAC audio converted to 640x360 H.264/AAC MP4, fast-start atom order, source preservation, invalid extension and same-source rejection, and existing-export preservation. Existing 4K sample/approval workflow and multipart upload tests continue passing.

This is a conversion-assisted upload workflow, not direct MKV streaming. A full-length customer movie and Windows runtime have not been tested.

Packaged Mac arm64 build opened successfully against the production catalogue; new MKV preparation controls were visually verified in the unsaved New movie form (studio-mkv.png). Mac DMGs use the available Apple Development identity and are not notarized.
