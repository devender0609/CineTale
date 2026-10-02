# CineTale v1.9.57 QA Report

## Scope
Responsive media-fit hardening requested after live Sync Labs validation. This release does **not** change the proven Sync Labs pipeline revision, provider model, job submission, audio authority, or synchronized-asset adoption logic. It only changes how mounted video uses the visual space allocated to it.

## Media-fit fix
- Scene video containers adopt the video's actual `videoWidth / videoHeight` ratio after `loadedmetadata`.
- Mounted scene videos are pinned to all four edges of their media surface (`position:absolute; inset:0; width:100%; height:100%`).
- `object-fit: contain` is retained to prevent clipping/cropping or geometric distortion.
- Scene media remains responsive on desktop/tablet/mobile.
- Final sequence, final rendered preview, and library video preview are explicitly full-width and aspect-aware.
- Lip-sync pipeline revision remains `v1.9.56-production-sync-hardening` so existing paid synchronized outputs are not invalidated or regenerated.

## Validation
The final package was subjected to the existing full CineTale release gate plus a new v1.9.57 media-fit regression. The new regression checks version/cache busting, unchanged Sync Labs pipeline revision, metadata-driven intrinsic ratio adoption, edge-to-edge mounting, no-crop behavior, and coverage of final/preview video surfaces.

## Live-provider limitation
No new Sync Labs generation is required for this UI-only release. Automated checks do not spend Sync Labs, ElevenLabs, Google/Veo, or other provider credits. The user-provided synchronized reference clip was inspected separately and is 1280×720 (16:9), which matches the standard landscape surface.

## Final execution results
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS (177 static IDs, 451 DOM references, 19 API routes, 96 files checked)
- scene audio regression — PASS
- approved voice-mix regression — PASS
- lip-sync regression — PASS
- stable player lifecycle regression — PASS
- lip-sync status resilience — PASS
- synchronized-asset adoption/resume regression — PASS
- v1.9.48 through v1.9.56 carry-forward regressions — PASS
- v1.9.57 exact-fit media regression — PASS
- full JavaScript/MJS syntax sweep — PASS

The quota/fallback log lines emitted during regression execution are deliberate simulated failure-path tests and are not failed assertions.
