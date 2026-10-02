# CineTale v1.9.47 QA Report

## Scope
This release focuses on the remaining production lip-sync defect observed in Firefox after v1.9.46: source-video playback was stable, FAL queue submission succeeded, but the synchronized asset could fail to become the active scene video.

## Root-cause findings
1. `sceneStudioVideoUrl()` pinned the original Veo/source URL for the scene lifecycle. After a FAL result became validated, the old source pin could still win on later renders.
2. The scene `play` and `seeking` handlers used `sceneHasCurrentLipSync()` together with `scenePrimaryVideoUrl()`. A provider result that existed but had not yet been browser-validated could therefore resolve back to the source URL and be mistaken for the synchronized asset, short-circuiting validation/adoption.
3. In-flight FAL queue metadata was not fully persisted. After a refresh, CineTale could lose the canonical status/result URLs and start another billable job instead of resuming the existing request.
4. The status endpoint trusted queue-status polling too heavily. If the status endpoint lagged or returned a retryable response while the result endpoint was already ready, the browser could remain in a processing loop.
5. Provider/debug status text such as `Source video · lip-sync unavailable` was rendered on top of the creative video surface.

## Fixes
- A validated FAL asset now supersedes an older source pin on the next safe render.
- Player logic only treats `lipSyncValidated === true` and the actual `lipSyncVideoUrl` as synchronized media.
- FAL request ID, model, status URL, response URL, and start time are persisted.
- Existing processing jobs are resumed before CineTale submits any new billable request.
- The server now probes the FAL result endpoint when queue status is transient, stale, unexpectedly shaped, or temporarily unreachable.
- Result parsing accepts the documented `video.url` shape and defensive wrapped variants.
- Provider/debug lip-sync wording was removed from the video overlay; users see only `Video ready`.
- The v1.9.46 lip-sync signature revision is intentionally preserved so already-running v1.9.46 FAL jobs can be resumed after deployment instead of invalidated.

## Validation performed
- `npm run check`
- `npm run smoke`
- `npm run qa:deep`
- `npm run qa:scene-audio`
- `npm run qa:voice-mix`
- `npm run qa:lipsync`
- `npm run qa:player-lifecycle`
- `npm run qa:lipsync-status`
- `npm run qa:lipsync-adoption`
- Full `node --check` syntax sweep for app, API, library, and regression scripts
- ZIP integrity verification

## Live-provider limitation
The production FAL account and the user's deployed Firefox/Vercel session are not available inside this build environment, so the final Sync-3 output cannot be visually certified here. The release specifically hardens the queue/result/adoption path that prevented a real FAL result from becoming the active scene video. Production verification should confirm that a completed Scene 5 playback/download is no longer byte-identical to the original Google/Veo clip.
