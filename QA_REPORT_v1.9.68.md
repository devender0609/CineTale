# CineTale v1.9.68 QA Report

## Root cause corrected
Previous builds only restored a synchronized scene when `lipSyncValidated` was still true or the saved signature already matched the current signature. The affected project had already persisted Scene 2 / Scene 5 with their paid Sync Labs output still present but `lipSyncValidated=false` / stale signature, so the Studio classified them as SYNCING and removed controls. The previous migration therefore could not recover them.

v1.9.68 adds read-only recovery of an already-existing distinct Sync Labs/FAL synchronized asset. Before any new lip-sync submission path is considered, CineTale verifies the saved synchronized MP4 is still playable, verifies that it is distinct from the source and belongs to the same source video, then restores the current scene signature and READY/validated state. Recovery itself does not submit a new provider job.

A second Preview Sequence defect was also corrected: Preview previously waited for the same clip's `ended` event twice. The first wait completed, then the second listener was attached after the event had already fired, preventing advancement to the next scene. Preview now has exactly one ended-wait per clip and remains read-only.

## Validation performed
- `npm run check`: PASS
- smoke suite: PASS
- deep QA: PASS — 178 static IDs, 457 DOM references, 19 API routes, 118 files checked
- lip-sync regression: PASS
- Sync status resilience: PASS
- Sync adoption/resume: PASS
- player lifecycle / Firefox behavior: PASS
- scene audio: PASS
- approved voice mix: PASS
- video MIME/range: PASS
- character-ID voice continuity: PASS
- all v1.9.48 through v1.9.67 carry-forward regressions: PASS
- new v1.9.68 stale saved-sync recovery regression: PASS
- new Preview single-ended-wait regression: PASS
- complete JS/MJS syntax sweep: PASS
- ZIP integrity: PASS

## Important live-provider limitation
The local QA validates the code path and prevents billable resubmission during saved-asset recovery. It cannot independently prove that a specific user's persisted Sync Labs generation still exists on the live provider. On deployment, Scene 2 and Scene 5 should be recovered by validating their already-saved `/api/lipsync-video?...` assets. If the provider itself no longer has one of those generation IDs, CineTale will leave that scene unfinished rather than silently submit a paid replacement.
