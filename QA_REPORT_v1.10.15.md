# CineTale v1.10.15 QA Report

## Release purpose
Approved-audio finalization for speaking clips. A synchronized speaking clip is no longer production-ready merely because the provider returned a playable video. CineTale reopens the exact approved character TTS, verifies that the audio is non-silent, embeds it into the synchronized visual as a single MP4 in the browser, persists that finalized file, and only then marks the scene READY.

## Key changes
- Added approved TTS signal validation (duration, RMS, peak).
- Added browser-side MP4 finalization using the synchronized video track plus the exact approved TTS track.
- Added digest guard so the audio used for finalization must match the audio submitted for synchronization.
- Speaking scenes now require `lipSyncEmbeddedAudioVerified === true` before `sceneHasValidatedLipSync()` can return true.
- Existing completed Sync Labs generations can be resumed by generation ID for audio finalization; they do not require a new paid submission.
- Explicit Complete/Retry primes the media audio context before the long provider workflow.
- Fixed blob URL canonicalization: valid `blob:https://...` references are preserved instead of being corrupted into network URLs.
- Added diagnostics: `approved-audio-verified` and `embedded-audio-finalized`.

## Verification performed
- JavaScript/MJS syntax checks: PASS.
- `npm run check`: PASS.
- `npm run smoke`: PASS.
- `npm run qa:deep`: PASS.
- 75 non-core regression/runtime scripts: PASS.
- New v1.10.15 approved-audio finalization regression: PASS.
- Deep QA counts: 188 static IDs, 464 DOM refs, 19 API routes, 3 local assets, 208 files after this report is included.

## Important live-runtime limitation
The environment does not have the user's production browser session, Sync Labs credentials, Supabase session, or ElevenLabs session. A headless Chromium capability probe was attempted but timed out in this environment, so browser MP4 `MediaRecorder`/`captureStream` behavior is **not** claimed as live-verified here. The production release therefore remains an RC until the deployed browser completes one Scene 1 finalization and the owner diagnostic shows `approved-audio-verified -> embedded-audio-finalized -> sync-persisted -> sync-authoritative`, followed by audible playback.

## Safety / cost behavior
For an already-completed generation, v1.10.15 can reuse the saved Sync Labs generation ID and finalize its audio without starting another paid lip-sync generation. A speaking clip is left unapproved rather than silently falling back to detached audio or marking a silent MP4 READY.
