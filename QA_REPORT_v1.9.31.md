# CineTale v1.9.31 — Video Replacement / Firefox MIME Stabilization QA

## Scope
This build is deliberately limited to the live video defects reproduced in v1.9.30:
1. Regenerate clip could remain in `Rendering…` indefinitely when an older `videoUrl` already existed.
2. Firefox could receive an incorrect MIME label on a non-zero range request because the proxy trusted the upstream `video/*` header before probing the file signature.
3. While a replacement was rendering, the old broken video element remained mounted and could flicker/show Firefox's native unsupported-format message.

No intentional changes were made to story generation, Projects navigation, auth, cloud sync, image generation, consent, voice selection, final assembly, or the Projects toolbar.

## Code corrections
- Replacement polling now continues while an older `videoUrl` is present; it stops only if the scene disappears or the active `videoOperation` changes.
- While `videoOperation` is active, CineTale shows storyboard art / a CineTale rendering placeholder instead of mounting the stale prior video element.
- Successful replacement clears `videoError` / playback-error metadata and atomically swaps in the new `videoUrl`.
- Provider error clears the active operation and records the failure instead of leaving an endless rendering state.
- Long-running polling has a finite timeout that resets the operation and preserves the previous clip rather than leaving `Rendering…` forever.
- `/api/video-file` now probes the first bytes before trusting an upstream declared video MIME. File magic wins over a stale/misreported `video/mp4` header.
- Non-zero range requests use the probed/cached container type, preventing Firefox from receiving a mismatched MP4 label for WebM bytes.
- App asset cache-busting bumped to `v1.9.31`.

## Validation completed
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
  - 177 static IDs
  - 442 DOM references
  - 16 API routes
  - 48 files deep-checked
- 25 JS/MJS files `node --check` — PASS
- `node scripts-video-regression.mjs` — PASS
  - verifies HEAD container detection
  - verifies non-zero byte-range response
  - verifies WebM magic overrides a misleading `video/mp4` upstream declaration
- Smoke regression explicitly asserts the old broken guard `scene.videoUrl || ...` is absent from replacement polling.
- Smoke regression verifies stale video is hidden during an active replacement render.

## Live-production limitation
The production Veo file and the user's exact Firefox media stack cannot be exercised from this build environment because the deployment's live provider credentials/media URI are not available here. Therefore the final acceptance test remains one real regenerated clip in the deployed Firefox app. The code-path defect that caused endless replacement polling is directly reproduced in source and corrected in this build.

## First acceptance test after deployment
1. Settings → System Health → confirm `App build: v1.9.31`.
2. Open the same `Midnight Shift` scene.
3. Click **Regenerate clip** once.
4. Confirm the broken old player is replaced by a stable rendering state.
5. Confirm the render eventually becomes **Video ready** or surfaces a clear provider/timeout error — it must not remain `Rendering…` forever.
6. Play the newly returned clip in Firefox and confirm the unsupported MIME message is gone.
