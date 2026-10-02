# CineTale v1.10.64 QA Report

## Release focus
v1.10.64 fixes the speaking-shot state machine exposed by Scene 2 / Shot 2 after v1.10.63. Clicking **Finish Shot N dialogue** could cause the UI to oscillate between a dialogue action and **Rendering Shot N…** even though the source video was already generated and only lip-sync/dialogue work remained.

## Root cause
`shotTimelineStatus()` represented both Veo video generation and dialogue synchronization with the same generic `kind: active`. `selectedShotButtonState()` therefore rendered every active operation as **Rendering Shot N…**. In addition, user-initiated and studio-open recovery could poll the same persisted dialogue-sync request concurrently. A terminal dialogue-sync provider error also did not persist a distinct retry state.

## Fixes
- Added a distinct `syncing` state: **DIALOGUE SYNCING** is no longer presented as video rendering.
- Added a distinct `sync-error` state with **Retry Shot N dialogue**.
- A saved speaking-shot source remains preserved through all dialogue-sync failures.
- Terminal dialogue-sync provider failures clear only the sync operation and preserve the already-generated video.
- Added per-operation single-flight polling for coverage-shot dialogue synchronization.
- Stale clicks while dialogue sync is active cannot submit another video or dialogue job.
- Both `pending` and `sync-error` actions resume only the dialogue synchronization path.
- Existing v1.10.63 selected-shot media decode shielding and synchronized-audio lifecycle remain intact.

## Validation
Source-tree gate:
- 130/130 script-level regression/runtime/QA checks passed.
- 154/154 JavaScript/MJS syntax checks passed.
- `npm run check` passed.
- `npm run smoke` passed.
- `npm run qa:deep` passed.
- Deep QA inspected 188 static IDs, 476 DOM references, 19 API routes, 3 local assets, and 315 files.
- New v1.10.64 speaking-shot sync-state regression: 8/8 passed.

## Live-provider limitation
No additional paid Veo or lip-sync generation was submitted solely for release QA. The fix is validated against the saved-state and state-machine code paths plus the full regression suite. Live provider completion still requires production acceptance testing.
