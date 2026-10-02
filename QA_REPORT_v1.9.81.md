# CineTale v1.9.81 QA / Release Gate

## Release objective

Move CineTale away from fragile "one short clip + detached browser-timed audio" behavior and toward a professional story-production model: timed shot planning, clean video surfaces, synchronized media as the authoritative speaking output, scene-local media updates, and stable final assembly.

## Code changes verified

- Added deterministic timed shot planning with explicit `startSec`, `endSec`, and `durationSec` values.
- Shot plans cover the full scene story beat without modulo-looping generated clips.
- Dialogue turns preserve speaker and line order in the shot plan.
- Provider duration selection follows each shot's planned duration and maps to supported 4/6/8-second Veo windows.
- Unsynchronized speaking source video is visual-only; CineTale no longer overlays separately timed approved TTS on mouth motion.
- Approved voice review remains available through the existing **Listen** workflow.
- Playable video frames no longer display technical/status labels such as "Source preview + approved voice".
- Video `ended` no longer swaps the source or remounts Studio.
- Completion of one video-generation job patches that scene's media element instead of rebuilding all scene players.
- Final assembly orders unique media by timed shot order and uses each saved source at most once.
- Final audio is admitted only from the validated synchronized timeline entry; raw provider/coverage audio remains excluded.
- ElevenLabs v3 automatic performance tags were reduced: generic natural/conversational lines are not automatically tagged, and strong tags are limited to clearly requested emotional delivery.

## Automated release gate

Working source:

- 46 / 46 `scripts-*.mjs` regression / smoke / deep-QA scripts passed.
- 70 / 70 JavaScript / MJS files passed `node --check` syntax validation.
- Deep QA passed: 182 static IDs, 462 DOM references, 19 API routes, 3 local assets, 146 files checked.
- `scripts-v1981-professional-timeline-regression.mjs` specifically validates timed-shot continuity, dialogue ordering, provider-duration mapping, clean video surfaces, no detached TTS-over-video behavior, no end-of-playback remount, scene-local media patching, and synchronized-audio-only final routing.

Packaged-copy verification:

- ZIP integrity: no compressed-data errors.
- Extracted packaged copy: 46 / 46 regression / QA scripts passed.
- Extracted packaged copy: 70 / 70 JavaScript / MJS syntax checks passed.

## Deliberate behavior changes from older releases

Several older regression assertions were reviewed and updated because they enforced behavior that is now intentionally removed, including:

- automatically layering approved audio over an unsynchronized source clip;
- hot-swapping to a synchronized source when a video ends;
- remounting Studio after playback completion;
- displaying technical preview state on the video surface;
- assuming the synchronized speaking clip must always be the first item in a scene rather than respecting a timed shot sequence.

Those tests were not simply disabled; they were replaced with assertions for the new intended behavior.

## Important limitation / not claimed

This environment did **not** complete a reliable real deployed-browser test against the user's Vercel deployment and live Google Veo / ElevenLabs / Sync Labs providers. Therefore this report does not claim that Firefox/Vercel/provider runtime behavior was physically reproduced here. The code, state logic, API contracts, regression suite, syntax, ZIP integrity, and extracted package were verified. A live deployment test remains required before calling the release production-proven.

## SQL

No new SQL migration is required for v1.9.81. If the one-time Supabase final-video storage setup was already run for an earlier build, do not run it again.
