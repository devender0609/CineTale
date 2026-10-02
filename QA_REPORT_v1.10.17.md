# CineTale v1.10.18 QA Report

## Release purpose
Fix the production state-machine deadlock observed in v1.10.16 where a speaking scene could remain indefinitely on **Finalizing dialogue…** after the approved character voice/performance changed while an older paid synchronized generation was still attached to the scene.

## Production defect reproduced from live diagnostics
- Scene source remained durable and production-provenance valid.
- Existing lip-sync generation was completed/paid, but its saved dialogue signature belonged to an older approved voice/performance.
- Current scene signature differed, so reusing/finalizing that older sync would be unsafe.
- Background hydration used `allowSubmit:false`, so it would not create the required replacement sync and the UI remained stuck.

## v1.10.18 repair
- Added `sceneHasSupersededDialogueSync()` to detect an older synchronized/pending result whose source production identity is still the same exact project / episode / scene / shot / speaker / spoken line but whose approved dialogue signature has changed.
- Added `supersedeStaleDialogueSyncForAutomaticRefresh()`.
- Records the prior generation ID in `lipSyncSupersededGenerationId` and timestamp before detaching stale active sync state.
- Preserves the durable source video and its strict production contract.
- Clears only stale lip-sync state, sets `lipSyncAutoPending=true`, and moves scene to `preparing`.
- `ensureSceneLipSync()` authorizes one automatic replacement submission for this narrowly-defined stale-voice/performance case, even when entered from background hydration.
- Added diagnostic stages `stale-dialogue-sync-superseded` and `auto-dialogue-refresh-authorized`.
- No normal-user **Complete clip** step was reintroduced.

## Validation
Source tree:
- JS/MJS syntax: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: 77/77 PASS
- New v1.10.18 stale-dialogue-refresh regression: PASS
- Deep QA inventory: 188 static IDs, 464 DOM references, 19 API routes, 3 local assets, 211 files checked before packaging.

## Live-provider limitation
No production Sync Labs or ElevenLabs credentials were executed from this QA environment. Static/runtime regression coverage verifies the state transition and submission authorization logic, but final production acceptance still requires a deployed speaking-scene test proving the new approved voice reaches synchronized playback and survives refresh/reopen.
