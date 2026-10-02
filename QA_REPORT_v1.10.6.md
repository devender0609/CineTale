# CineTale v1.10.6 QA Report — Authoritative Synchronized-Audio Adoption

## Live symptom investigated
Two user-supplied `.m4v` files from the deployed app were independently inspected and both contained real stereo AAC audio. The deployed CineTale player nevertheless produced no audible sound.

## Root cause
The Studio renderer intentionally mutes speaking-scene source previews until `sceneHasValidatedLipSync(...)` is true. A synchronized result could remain outside that validated state because `sceneVideoProductionContract()` recomputed the scene's primary coverage shot from the current plan instead of reconstructing the exact shot identity persisted with the generated source video. Coverage-plan drift could therefore make the same source video fail its own production-provenance check. The synchronized asset would not become authoritative, leaving the mounted player in the muted source-preview state.

## Fix
- Added `sourceVideoProductionShot(scene)`.
- Once a source video exists, production-contract validation uses the persisted source identity: `videoPrimaryShotId`, `videoPrimarySpeaking`, `videoPrimarySpeaker`, `videoPrimarySpokenLine`, source timing, and the matching plan entry only for non-identity visual/camera context.
- `sceneVideoProductionContract()` now validates against that persisted source-shot identity instead of reselecting `primaryCoverageShot(scene)`.
- Kept the safety rule that unfinished speaking source media remains muted; raw/provider speech is not promoted merely because the MP4 contains audio.
- Kept the finished-player rule that validated synchronized media explicitly restores `muted=false`, `defaultMuted=false`, removes the `muted` attribute, and sets volume to 1.
- Kept scene-local preview-to-finished player replacement so sync-gate listeners cannot survive the transition.

## Verification — source tree
- `node --check app.js`: PASS
- API/library JS syntax: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Regression scripts: 63/63 PASS
- v1.10.6 authoritative-sync-adoption regression: PASS
- Deep QA: 182 static IDs, 462 DOM references, 19 API routes, 3 local assets, 186 files checked

## What was not verified
No live Veo/ElevenLabs/Sync Labs generation was triggered from this environment. Actual deployed browser audio, provider synchronization quality, and persistence after refresh/reopen remain live acceptance gates.

## Required deployed acceptance
Use one already-generated speaking scene first. A successful scene must mount the synchronized CineTale-owned asset as the authoritative `<video controls>` player with embedded audible dialogue. Refresh and reopen must preserve the same audible synchronized clip. Raw source/provider speech must never be promoted as the finished dialogue track.
