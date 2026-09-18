# CineTale v1.8.2 QA Report

## Why this build exists
The v1.8.1 one-click final-production flow could feel glitchy because it generated/waited scene-by-scene, a single provider/status error could interrupt the whole run, an interrupted browser session had limited recovery, and the browser final recorder could start before all video/voice assets were loaded. That could create long perceived stalls and blank/idle frames in the recorded final file.

## Fixes made
1. **Resumable automatic production**
   - Project stores automatic-production status, mode, selected scene indexes, stage, completed count, and scene errors.
   - Completed clips are retained. Retry/resume only works on missing clips.
   - Added pause control.
2. **Faster/smoother scene pipeline**
   - Submit missing selected scene jobs first.
   - Poll completed operations with bounded concurrency (2 workers).
   - Retry temporary 408/425/429/5xx status failures with capped backoff.
3. **Clear partial-failure handling**
   - Final Assembly differentiates READY, RENDERING, RETRY, PENDING and SKIPPED.
   - One failed scene no longer discards completed work.
4. **Safer resume/locking**
   - Automatic job lock receives heartbeat updates during active work and becomes reclaimable when stale, reducing refresh/crash deadlocks while still blocking duplicate runs.
5. **Final-file smoothness**
   - All selected scene videos and approved voice assets are loaded before MediaRecorder starts.
   - Network/TTS loading time is no longer captured as blank video.
   - Actual recording begins only after media preparation succeeds.
6. **Responsive/UI polish**
   - Automatic final controls stack cleanly on smaller widths.
   - Long provider errors wrap within scene-status cards.
   - Sticky final progress remains visible during long renders.

## Automated/static validation completed
- Package JSON parse: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- JS/MJS syntax (`node --check` all files): PASS
- Merge conflict marker scan: PASS
- HTML duplicate IDs: PASS (163 IDs, 0 duplicates)
- Local HTML asset references: PASS
- App API references mapped to handlers: PASS
- All 40 static button IDs referenced by application code: PASS
- All 11 static select IDs referenced by application code: PASS
- Existing Veo request compatibility regression checks: PASS
- Existing Supabase auth / Google OAuth UI checks: PASS
- Existing ElevenLabs fallback/audio checks: PASS
- Optional scene inclusion + final assembly checks: PASS
- New resumable final-production checks: PASS
- New transient provider retry checks: PASS
- New final-media preloading checks: PASS

## Important runtime boundary
The automated suite can verify request construction, state transitions, fallback logic, DOM integrity and the final-render orchestration. It cannot reproduce live Google/ElevenLabs queue latency from the local test environment. Live deployment testing should therefore use one short project first and verify: start → queue all selected clips → recover from navigation/refresh → all clips ready → final render → playback/download.
