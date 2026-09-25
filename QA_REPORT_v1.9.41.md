# CineTale Studio v1.9.41 QA Report

Date: 2026-09-23

## Release purpose

v1.9.41 fixes the v1.9.40 scene-video regression in which a working Veo/source clip could disappear while a FAL lip-sync replacement was still being prepared. The release changes lip-sync adoption to a non-destructive, verified handoff.

## Lip-sync handoff correction

- Existing/source video remains visible and playable while lip-sync is queued or processing.
- Approved character/narrator voice continues as the safe clean-audio fallback while the dedicated synchronized clip is pending.
- The FAL result is preloaded in a detached video element before the active scene player is touched.
- CineTale replaces the active source only after the synchronized result reaches browser metadata/can-play readiness.
- Playback position is preserved when possible during the switch.
- If the synchronized asset fails during or after adoption, CineTale restores the original scene video automatically instead of leaving a blank player.
- A runtime `<video>` error on a synchronized asset also restores the original source and records a lip-sync playback error for diagnostics.
- No preparation/status badge is drawn over the scene image/video.
- Cache-busting is advanced to `v=1.9.41` for both app JavaScript and CSS.

## Regression validation executed

All of the following completed successfully in the packaged source tree:

- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
  - 177 static UI IDs checked
  - 448 DOM references checked
  - 18 front-end referenced API routes checked
  - 64 project files checked
- `npm run qa:scene-audio` — PASS
- `npm run qa:voice-mix` — PASS
- `npm run qa:lipsync` — PASS
  - FAL queue submission contract
  - FAL completion/result proxy contract
  - synchronized result distinction from the Google/Veo source
  - preflight verification before handoff
  - preservation/rollback of source video
  - no forced pause while FAL is pending
  - final-render prevention of duplicate dialogue overlay
- `node scripts-video-regression.mjs` — PASS
- `node scripts-voice-continuity.mjs` — PASS
- syntax check of every `.js` and `.mjs` file — PASS
- merge-marker / JSON integrity checks — PASS

The image-provider and TTS regression suites intentionally exercise simulated provider failures such as Gemini quota exhaustion, unsupported image delivery, and an unavailable ElevenLabs model fallback. Those logged warnings are expected test cases and did not fail the suite.

## Preserved product behavior checked by regression suite

The existing automated checks continue to cover Story / Short / Movie / Episode integrity; Create / Projects / Studio / Library navigation; project opening race protection; authentication and cloud-workspace handling; story approval and production gates; character identity and voice continuity; personal-voice consent; image fallback/quota handling; no-crop/safe-framing media behavior; scene video generation and recovery; Firefox MIME/range handling; automatic production; final assembly; and final-video rendering paths.

## Important live-provider limitation

The local QA environment does not contain the user's production `FAL_KEY`, ElevenLabs credentials, Veo/Gemini credentials, authenticated Supabase session, or deployed browser state. Therefore this report validates the code paths, provider request/response contracts with mocks, rollback behavior, and regression coverage, but it does **not** claim a paid live FAL lip-sync job was completed from this environment.

## Production acceptance test

After deploying v1.9.41, use an existing speaking scene (do not regenerate the Veo clip):

1. Play the scene. The original video must remain visible while lip-sync is prepared.
2. In Network, confirm `/api/lipsync-job` followed by `/api/lipsync-status` calls when a current synchronized result is not already saved.
3. After completion, replay the scene and inspect the video URL. The synchronized result should resolve through `/api/video-file?uri=...` to FAL storage rather than `generativelanguage.googleapis.com`.
4. If FAL fails or its result is unplayable, the original scene must remain/restored instead of disappearing.
5. Confirm the same character voice remains consistent across scenes and that no original provider speech is audible underneath the approved voice.
6. Test Preview sequence with two ready scenes before generating the rest of the episode.
