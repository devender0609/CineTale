# CineTale Studio v1.9.40 QA Report

## Defect reproduced from production evidence
The deployed v1.9.39 health endpoint reported FAL lip-sync configured, but the browser Network panel showed no `/api/lipsync-job` or `/api/lipsync-status` calls and the actual scene `<video>` sources still pointed to `generativelanguage.googleapis.com`. This proved the UI was playing the original Veo assets rather than adopting a FAL synchronized result.

## v1.9.40 correction
- A stored lip-sync result is accepted only when it is explicitly marked `fal-sync`, has the current scene/voice signature, and is distinct from the original source video.
- Legacy/stale `lipSyncVideoUrl` values that resolve back to the Google/Veo source are rejected and reprocessed.
- Speaking-scene playback now pauses the unsynchronized source, performs/awaits the lip-sync job, persists the returned FAL result, swaps the live `<video>` source to that result, and then resumes playback.
- Current FAL-synchronized video uses its embedded approved audio directly. The browser overlay voice path is now fallback-only when dedicated lip-sync is unavailable.
- Final sequence and final render resolve `scenePrimaryVideoUrl`, so they use the synchronized asset when current.
- Final render ensures missing lip-sync for speaking scenes and does not add a second voice track to an already synchronized video.
- Final render uses full gain for embedded synchronized audio and keeps provider guide audio muted only in the fallback separate-voice path.
- Asset cache-busting was advanced from `v=1.9.39` to `v=1.9.40` to prevent production browsers from retaining the old playback bundle after deployment.

## Validation performed
- JavaScript syntax checks: PASS
- Package/JSON/merge-marker checks: PASS
- Full smoke suite: PASS
- Deep QA: PASS (177 static UI IDs, 448 DOM references, 18 API routes, 64 files)
- Scene dialogue/video regression: PASS
- Clean approved-voice mix regression: PASS
- Dedicated FAL lip-sync integration regression: PASS
- Firefox video MIME/range regression: PASS
- Character-ID voice continuity regression: PASS
- ZIP integrity: to be verified after packaging

## Provider contract verification
FAL Sync-3 documentation confirms `fal-ai/sync-lipsync/v3` accepts `video_url`, `audio_url`, and `sync_mode`, accepts Base64 data URIs for file inputs, and returns a generated video file URL. Live paid-provider execution was not performed in the build environment because the user's production `FAL_KEY` is not available here.

## Production acceptance check
After deployment, play one speaking scene. In DevTools Network, `/api/lipsync-job` followed by `/api/lipsync-status` should appear on the first synchronization. After completion, the scene video source should resolve through `/api/video-file?uri=...fal.media...` (or supported FAL storage), not `generativelanguage.googleapis.com`. Subsequent playback should reuse the saved synchronized result without another paid lip-sync call unless the source video, dialogue, or voice changes.
