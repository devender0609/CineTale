# CineTale v1.10.18 QA Report

## Scope
This release is narrowly focused on resilient recovery of paid dialogue-sync generations when browser/API status polling encounters transient transport failures.

## Production defect addressed
The v1.10.17 production trace showed fresh Sync Labs generations were successfully submitted, but `/api/lipsync-status` polling could abort on browser `NetworkError when attempting to fetch resource`. The client then risked moving the scene into an error path even though provider work was still processing.

## Changes
- Transient status-poll failures (network/fetch errors, 408, 425, 429, and 5xx) now retry the same provider request rather than throwing immediately.
- The existing `lipSyncOperation` and `lipSyncGenerationId` are preserved while polling is temporarily unavailable.
- After 8 consecutive transport failures, the local polling loop pauses cleanly and leaves the scene in resumable `processing` state. Refresh/reopen can resume the same provider generation.
- Durable provider generation IDs in PENDING/PROCESSING/COMPLETED state are no longer discarded solely because a local wall-clock stale interval elapsed.
- Added diagnostics: `lipsync-status-transient-retry` and `poll-paused-preserving-job`.
- No source-video regeneration logic was changed.
- No voice-selection logic was changed.
- No automatic duplicate provider submission is introduced by this patch.

## New regression
`scripts-v11018-lipsync-polling-recovery-regression.mjs`

It verifies:
1. Two simulated `NetworkError` failures followed by successful provider responses recover the same generation to READY.
2. Eight consecutive transport failures pause polling without clearing the request ID, generation ID, or processing state.
3. Durable provider generation IDs remain resumable across elapsed wall-clock time.

## Source-tree verification
- All JS/MJS syntax checks: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- 78/78 non-core regression/runtime scripts: PASS
- Deep QA: 188 static IDs, 464 DOM refs, 19 API routes, 3 local assets, 214 files checked before packaging.

## Live-provider limitation
No production Sync Labs or ElevenLabs credentials were used during local QA. This remains a release candidate until the deployed project resumes the existing production generation, receives COMPLETED status, persists/finalizes the synchronized media, and audibly plays the approved voice after refresh/reopen.
