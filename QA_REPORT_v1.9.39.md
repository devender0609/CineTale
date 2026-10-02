# CineTale v1.9.39 QA Report

Release focus: remove creator-facing voice-processing overlays from scene video and add a dedicated lip-sync post-processing stage for approved character voices.

## What changed

- Removed the scene-video overlay/status badge that displayed voice preparation or source-audio status.
- Preserved v1.9.38 source-speech muting so provider guide speech cannot compete with the approved CineTale voice.
- Added an optional dedicated lip-sync queue integration using `fal-ai/sync-lipsync/v3`.
- Builds a scene-level approved audio mix from the currently selected character/narrator voices and uses that exact audio as the lip-sync input.
- Uses `remap` duration handling by default to reconcile small audio/video length differences.
- Stores a lip-sync signature containing source video, dialogue, narration, scene delivery settings, character voice assignments and narrator voice settings. A voice/dialogue/video change therefore invalidates a stale synced clip automatically.
- Existing v1.9.38 clips can be lip-synced without regenerating the Veo visual.
- Lip-sync output is routed through CineTale's video proxy so Firefox MIME/range behavior and final-render access remain consistent.
- System health now reports whether the dedicated lip-sync service is configured.
- `.env.example` documents all lip-sync deployment variables.

## Important accuracy boundary

A dedicated lip-sync model is materially stronger than timing an independent TTS track over an existing generated video. It can re-animate the mouth from the approved audio. However, no generative lip-sync service can be truthfully guaranteed to be mathematically or perceptually perfect on every frame, face angle, occlusion or multi-person shot. CineTale therefore does not claim literal 100% frame-perfect synchronization. The implementation uses a dedicated phoneme-aware post-processing path when configured and preserves a safe clean-audio fallback when it is not.

## Validation performed

- JavaScript syntax checks for all app/API scripts.
- Package/JSON and merge-marker checks.
- Full smoke suite.
- Deep QA suite covering static IDs, DOM references and API-route inventory.
- Character-ID voice continuity regression.
- Scene dialogue/video regression.
- Clean approved-voice mix regression.
- Firefox/video MIME + byte-range regression.
- Dedicated lip-sync integration regression with mocked queue submit, completed job result and proxied fal-media video playback.
- ZIP integrity test after packaging.

## Live-provider limitation

The fal/Sync integration was validated structurally and with mocked queue responses in this build environment. No real `FAL_KEY` was available here, so a live Sync-3 render was not charged or executed. Production verification requires `ENABLE_LIVE_LIPSYNC=true` and a valid `FAL_KEY` in Vercel.
