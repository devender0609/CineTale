# CineTale v1.9.70 QA Report

## Trigger
The supplied final-output WebM was inspected directly. It is a valid 1280×720 VP8/Opus WebM and plays for approximately 77.6 seconds. Frames sampled across the file confirm that multiple scenes are present, but the result is much shorter than the project's ~2:30 target and the user reported unwanted background/provider speech. The final player also became unavailable after automatic production completed.

## Root causes fixed
1. Final runtime was derived from the sum of generated clip lengths rather than the creator-selected project runtime. Short 6–10 second provider clips therefore produced an episode far shorter than the requested runtime.
2. For synchronized speaking scenes, source/provider video audio was routed into the final mix. Additional coverage clips could therefore leak temporary provider guide speech or other unwanted generated audio into the finished episode.
3. The outer automatic-production `finally` path still remounted Studio after successful final rendering, which could replace the just-mounted local final-video player and create the flicker/disappearing-player behavior.

## v1.9.70 behavior
- Final scene durations are allocated proportionally from the creator-selected `targetRuntimeSec`/duration.
- Visual coverage loops/alternates to fill that intended scene duration rather than ending when short source clips run out.
- Final audio prefers already-cached approved CineTale voice assets and does not create new TTS merely for final assembly.
- Provider/source video audio is muted in the final mix by default.
- If the approved local voice cache is unavailable for an already-synchronized speaking scene, the authoritative synchronized primary clip audio may be used once as a no-charge fallback; coverage-clip audio remains muted.
- Successful automatic final production no longer remounts Studio. It keeps the final player attached and reapplies the in-memory final Blob directly.
- Final render pipeline metadata advanced to pipelineVersion 6 / `target-runtime-approved-audio`.

## Validation
- `scripts-check.mjs` PASS
- `scripts-deep-qa.mjs` PASS — 178 static IDs, 457 DOM refs, 19 API routes, 3 local assets, 122 files checked
- lip-sync adoption/resilience/regression suites PASS
- Firefox/player lifecycle regression PASS
- scene audio regression PASS
- smoke PASS
- all carry-forward regressions v1.9.48–v1.9.69 PASS
- new v1.9.70 runtime/audio/player regression PASS
- video MIME/range regression PASS
- character voice continuity PASS
- approved voice mix regression PASS
- complete JS/MJS `node --check` sweep PASS

Provider error messages printed during mocked regression tests are expected fixtures for quota/fallback handling and are not live paid provider calls.

## Live limitation
The local QA suite cannot re-run the user's paid Google/Sync Labs generations. The release therefore does not claim live-provider confirmation. It specifically reuses existing scene media and cached approved audio where available.
