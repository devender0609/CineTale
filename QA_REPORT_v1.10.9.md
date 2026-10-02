# CineTale v1.10.9 QA report

## Release focus
Fix user-initiated **Retry clip** after a prior lip-sync submission/playback failure.

## Root cause confirmed in v1.10.8
`ensureSceneLipSync()` had a fail-closed early return for scenes whose current lip-sync signature had `lipSyncPlaybackFailedAt` or `lipSyncSubmissionFailedAt`. That return did not distinguish background recovery from an explicit user retry. Therefore the visible **Retry clip** action could call the lip-sync workflow and immediately exit without making a new synchronization attempt. `finishSceneClip()` then surfaced the generic "CineTale did not receive and validate a finished synchronized clip" error while preserving the muted Veo source.

The retry path could also continue with the stale scene object passed into `ensureSceneLipSync()` immediately after clearing persisted failure state.

## Changes
- Background hydration remains fail-closed after a failed sync and will not silently spend credits.
- An explicit `userInitiated` Retry clears only failed synchronization state: operation/status URLs, error markers, and failed-at timestamps.
- The existing durable source video, source production identity, dialogue, selected voice, art, and project data are preserved.
- The live project/scene is refreshed after clearing the failed attempt so the current exact production contract is rebuilt from persisted state before submission/resume.
- Added `scripts-v1109-user-retry-state-machine-regression.mjs` to prevent the Retry button from becoming a no-op again.

## Media evidence supplied by user
The two latest uploaded `.m4v` files were independently inspected with ffprobe/ffmpeg. Both are 8-second Google-encoded H.264 files with AAC audio streams and measurable audio signal. They are source-provider clips, not proof of a successfully adopted synchronized CineTale output. Therefore this release does not simply unmute source/provider audio.

## Source-tree validation
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- app/API/lib JavaScript syntax: PASS
- 67 non-core QA/regression scripts: PASS
- v1.10.9 user-retry state-machine regression: PASS

Deep QA reported 182 static IDs, 462 DOM references, 19 API routes, 3 local assets, and 193 files checked.

## Limitations
No live paid Sync Labs generation was executed from this environment, and no production browser session on the user's Vercel deployment was available here. The release therefore remains a release candidate until the deployed Retry clip flow reaches a completed synchronized output and that output is audibly playable after refresh/reopen.
