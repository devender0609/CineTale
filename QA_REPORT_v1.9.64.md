# CineTale v1.9.64 QA Report

## Scope
Production fix for Preview Sequence mutating completed speaking scenes and falsely showing “Dialogue sync in progress”.

## Root cause fixed
- Preview Sequence previously called `ensureSceneLipSync()` for unvalidated speaking scenes.
- That made a preview action capable of creating/resuming lip-sync work and changing scene state.
- The Studio status renderer also treated any unsynchronized speaking scene as “in progress”, even without an active request ID.

## v1.9.64 behavior
- Preview Sequence is read-only.
- Preview never calls `ensureSceneLipSync()`.
- Preview never calls browser-timed approved-voice overlay playback.
- Speaking scenes are previewed only from an already validated synchronized asset.
- Non-speaking scenes can preview their existing scene video.
- Scenes not finished are skipped rather than mutated.
- “Dialogue sync in progress” is shown only when `lipSyncStatus === processing`, there is a real `lipSyncOperation`, and the signature is current.
- Waiting/error states remain explicit only when genuinely present.
- Previewing existing completed scenes cannot intentionally create new Sync Labs generation charges.

## Final release gate
PASS:
- package/config check
- smoke suite
- deep QA
- scene audio regression
- approved voice mix regression
- dedicated lip-sync regression
- player lifecycle regression
- Sync status resilience
- Sync adoption/resume
- carry-forward v1.9.48-v1.9.63 regressions
- v1.9.64 read-only preview/state regression
- all JS/MJS syntax checks

Deep QA: 177 static IDs, 451 DOM references, 19 API routes, 110 files checked.

Simulated quota/provider-error messages emitted by regression tests are intentional failure-path fixtures, not failing tests.

## Live-provider limitation
The release gate does not execute the user's paid Sync Labs account. Existing validated synchronized assets are intentionally reused; Preview does not submit paid generation jobs.
