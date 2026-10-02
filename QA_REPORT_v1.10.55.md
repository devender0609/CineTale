# CineTale v1.10.55 — Persisted Coverage Recovery & Project-Open Reconciliation RC

## Root cause reproduced from the exported workspace
The real saved project stores Scene 2 / Shot 1's unfinished Veo operation inside `scene.coverageClips[0].operation`, while `scene.videoOperation` is absent. v1.10.54 resumed only primary `scene.videoOperation` jobs during normal Studio rendering and ran its project-wide scan only at initial app bootstrap. A cloud-loaded or later-opened project could therefore keep a persisted coverage operation in GENERATING indefinitely even after the provider had already returned a terminal no-asset result.

## Fix
- Every `openProject(id)` now schedules `reconcilePersistedVideoJobsOnOpen(id)` after switching to Studio.
- Studio rendering resumes both primary video jobs and coverage-shot jobs.
- Added dedicated persisted coverage reconciliation and background polling.
- `done:true` terminal errors/no-asset results clear the coverage operation and queued timestamp and move the shot to retryable failure state.
- `done:false` / processing results continue polling the same operation without submitting another video job.
- Ready coverage jobs are persisted and adopted before clearing their operation.
- Provider verification failures preserve the existing operation to prevent duplicate credit spend.
- Recovery code contains no `/api/video-job` submission path.

## Real-workspace shape check
The supplied workspace export was inspected directly before patching. It contains the exact v1.10.54 failure shape: Scene 2 Shot 1 has a persisted coverage operation and queued timestamp, with no primary scene video operation. The new open-project and active-Studio recovery paths both cover that state.

## Source validation
- 121/121 regression/runtime/QA scripts passed.
- 145/145 JavaScript/MJS files passed Node syntax validation.
- `npm run check` passed.
- `npm run smoke` passed.
- `npm run qa:deep` passed.
- Deep QA: 188 static IDs, 475 DOM refs, 19 API routes, 3 local assets, 295 files checked before the final report was added.

## Provider caveat
Packaging QA did not intentionally submit another billable Veo job. The existing smoke suite also encountered known Gemini image quota/delivery limitations and an ElevenLabs model fallback condition. These are provider/environment conditions, not claimed live-success checks.
