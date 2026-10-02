# CineTale v1.10.8 QA Report — Fresh Sync Job Polling Fix

## Root cause fixed
A newly accepted lip-sync submission persisted `lipSyncRequestDigest` and `lipSyncProductionContract` into project state, but `ensureSceneLipSync()` immediately continued with a stale pre-update `liveScene` object. The in-memory `job` also omitted those two identity fields. The next guard could therefore throw before the first lip-sync status poll, leaving the UI on the muted Veo source even though Sync Labs had accepted a generation.

v1.10.8 now carries `requestDigest` and `productionContract` directly on the in-memory job and refreshes the live project/scene after persisting the accepted job, before entering `pollSceneLipSync()`.

## Evidence reviewed
The two user-provided M4V files were probed with ffprobe. Both contain H.264 video plus stereo AAC audio and both report Google as encoder. They are source-provider clips, not proof of an adopted Sync Labs output. Therefore the correct fix is to complete/recover the synchronized-output lifecycle, not to expose source-provider audio.

## Verification performed
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- all JS/API/lib `node --check`: PASS
- 66 non-core QA/regression scripts: PASS
- new `scripts-v1108-fresh-sync-job-polling-regression.mjs`: PASS
- existing Sync Labs 422 -> assetId JSON retry runtime regression: PASS
- existing authenticated Supabase source handoff runtime regression: PASS
- existing durable source repair regression: PASS
- existing synchronized-player/adoption/audio regressions: PASS

## Browser/live-provider limitation
A local Chromium headless smoke attempt did not complete in this environment and was terminated by timeout. No live Sync Labs generation was purchased from this environment. Therefore v1.10.8 is a release candidate until the deployed provider/browser acceptance test confirms: accepted sync job -> status polling -> synchronized output -> durable persistence -> audible native player -> refresh/reopen persistence.
