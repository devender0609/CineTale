# CineTale v1.9.50 QA Report

## Release purpose
Fix the Firefox regression where clicking play on a speaking scene caused the app to pause the user-initiated video while waiting for asynchronous approved-voice preparation. Once the original user gesture expired, Firefox could reject the later programmatic resume, leaving the scene apparently frozen with no approved audio.

## Root-cause findings
- The uploaded Scene 5 clip remained the original 6.0-second Google/Veo MP4. It contains H.264 video plus a 48 kHz stereo AAC audio track, so the source file itself is not structurally silent.
- v1.9.49 explicitly called `video.pause()` inside the native `play` event, then awaited TTS/audio decoding, then attempted `video.play()` later. That architecture is unsafe in Firefox because the later play can occur outside transient user activation.
- The same gating path could therefore suppress both useful picture playback and approved-voice playback.

## v1.9.50 changes
- Never cancels or pauses a native user-initiated video play event to wait for async TTS.
- Starts approved-voice preparation while the video element remains in its user-authorized playback session.
- Adds an approved-audio preparation cache and Studio warmup so previously generated voice assets are ready before playback whenever possible.
- Prioritizes approved-audio preparation before background FAL lip-sync work.
- If approved audio preparation is slow, rewinds an already-playing short scene once rather than stopping it and trying to autoplay later.
- If approved voice playback cannot be prepared, restores audible source-video audio instead of leaving the video silent.
- Preserves validated FAL embedded audio as authoritative when a genuine synchronized asset is mounted.
- Preserves stable-player, FAL resilience/adoption, and no-horizontal-scroll final assembly behavior from prior releases.

## Automated validation
PASS:
- `npm run check`
- `npm run smoke`
- `npm run qa:deep`
- `npm run qa:scene-audio`
- `npm run qa:voice-mix`
- `npm run qa:lipsync`
- `npm run qa:player-lifecycle`
- `npm run qa:lipsync-status`
- `npm run qa:lipsync-adoption`
- `npm run qa:v1948`
- `npm run qa:v1950`
- syntax check for every `.js` and `.mjs` file

Deep QA counts:
- 177 static UI IDs
- 451 DOM references
- 18 API routes
- 80 project files checked

## New v1.9.50 regression assertions
- Native play handler contains no `video.pause()` call.
- Native play still starts approved-audio playback.
- Approved-audio warmup is present.
- Approved-audio preparation is cached.
- Source audio is restored on approved-audio failure.
- Late approved-audio preparation uses a one-time rewind guard instead of cancel/re-autoplay.
- Approved-audio warmup is prioritized before FAL warmup.

## Intentional simulated warnings during QA
The QA suite intentionally exercises Gemini quota errors, image-route fallback, ElevenLabs model fallback, and transient FAL status network failure. These warnings were expected test-path output; all suites completed successfully.

## Live-environment limitation
This sandbox cannot reproduce the user's authenticated production Firefox + Vercel + ElevenLabs + FAL session. Therefore automated QA verifies the control-flow regression and fallbacks, but final live provider timing and mouth synchronization must still be confirmed after deployment.
