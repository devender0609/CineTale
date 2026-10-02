# CineTale v1.10.13 QA Report

Purpose: repair the live pre-submission failure isolated by the v1.10.12 production trace.

## Live evidence addressed
- Retry click in v1.10.12 reached `ensure-sync-start` with `userInitiated:true`, `allowSubmit:true`, `quiet:false`, but no later audio/submission/polling trace appeared.
- Scene 2 retained a pending provider generation ID plus digest/production contract while `lipSyncOperation` had been cleared.
- Runtime player state still contained duplicated-origin source URLs.

## Changes
- Explicit Retry no longer blindly inherits an empty result from an already-running background sync task. It waits for the task to finish, rechecks validation, then continues with a fresh explicit attempt if necessary.
- Added pre-submission gate diagnostics for source provenance, submit-disabled, active-other-scene, resumable-job discovery/rejection, and in-flight task collision/release.
- Pending/processing provider generations can be resumed from `lipSyncGenerationId` when the exact scene signature, digest, and compatible production contract remain available, even if an older client cleared `lipSyncOperation` and marked the local scene error.
- Canonical media URL repair is enforced at runtime lookup and Studio player source selection, including legacy duplicated-origin values.

## Validation performed on source tree
- `node --check` across JS/MJS: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core QA/regression scripts: 73/73 PASS
- New `scripts-v11013-live-presubmit-regression.mjs`: PASS
- Deep QA: 187 static IDs, 464 DOM refs, 19 API routes, 3 local assets, 203 files checked.

## Release limitation
No live production Sync Labs/TTS credentials were exercised in this environment. This release is therefore a release candidate until one deployed Retry attempt reaches the provider submission/polling/adoption path and audible synchronized playback is verified.
