# CineTale v1.10.7 QA Report — Authoritative Audio + Sync 422 Recovery

## Live evidence that drove this release
- Two user-supplied `.m4v` clips were inspected with FFprobe.
- Both files contain H.264 video + AAC stereo audio.
- Both files report `encoder: Google`, identifying them as Google/Veo source clips rather than Sync Labs finished synchronized outputs.
- Therefore the prior no-audio symptom was not an empty media file: CineTale was still displaying the provider source path while the finished synchronized AV had not become authoritative.

## Root causes fixed
1. **DOM ready-marker mismatch**: synchronized markup emitted `data-lipsync-ready="1"` while runtime code checked `dataset.lipSyncReady`. These are different dataset keys. v1.10.7 standardizes on `data-lip-sync-ready="1"` / `dataset.lipSyncReady`.
2. **Stale preview state could survive hydration/patching**: finished audibility is now derived from live validated scene state plus the mounted player's actual `currentSrc`. If that mounted source is the authoritative synchronized runtime asset, CineTale clears `data-sync-gated`, removes `muted`, sets `defaultMuted=false`, `muted=false`, and `volume=1`.
3. **Sync Labs 422 compatibility path**: the normal request now uses the documented `active_speaker_detection: { auto_detect: true }` shape. If direct multipart submission returns HTTP 422, CineTale automatically uploads the exact owned video and approved audio as Sync assets and retries `/v2/generate` with JSON `input[].assetId`. No Veo regeneration and no provider-fetch URL fallback are used.

## New runtime regressions
- `scripts-v1107-authoritative-audio-dom-regression.mjs`: verifies one canonical DOM marker and live-currentSrc authoritative audio recovery.
- `scripts-v1107-sync-422-asset-retry-runtime.mjs`: simulates direct multipart 422 and verifies video+audio asset upload, asset registration, JSON assetId generation retry, and queued generation.

## Full source-tree gate
- App JS syntax: PASS
- API/lib JS/MJS syntax: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- All non-core `scripts-*.mjs` QA/regression scripts: 65/65 PASS

## Release limitation
No live Sync Labs generation was intentionally purchased from this execution environment. The final production gate remains one deployed speaking clip: source generation -> approved TTS -> Sync Labs accepted generation -> synchronized durable output -> mounted native player with embedded audio -> refresh/reopen persistence.
