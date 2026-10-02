# CineTale v1.9.56 QA Report

## Release goal
Production hardening after live Sync Labs validation succeeded. The live session proved the core render-stage pipeline works and produced a distinct synchronized Sync Labs MP4. v1.9.56 focuses on preventing duplicate or wasteful generations, recovering an already accepted generation when Sync Labs reports concurrency, and keeping background Studio warmup from silently starting billable jobs.

## Root-cause hardening
- Background Studio warmup may resume/poll an existing lip-sync generation but cannot start a new billable generation.
- Explicit scene playback or final-render workflows retain permission to start synchronization when required.
- CineTale serializes scene submissions in the current episode when another scene already has a saved processing generation.
- Observed Sync Labs `concurrency_limit_reached` is handled explicitly.
- On concurrency response, the server first searches for the deterministic output filename and recovers the already accepted generation if present.
- If the provider slot belongs to another scene, the server returns a non-terminal `busy` state rather than creating repeated POSTs or poisoning the scene as failed.
- Deterministic output filenames, canonical generation video routing, validated synchronized-asset preference, approved audio, stable Firefox player lifecycle, and responsive Final Assembly are preserved.

## Validation
PASS:
- `npm run check`
- smoke suite
- deep QA: 177 static IDs, 451 DOM references, 19 API routes, 93 files
- scene audio regression
- approved voice mix regression
- lip-sync/fallback regression
- stable player lifecycle regression
- lip-sync status resilience regression
- lip-sync adoption/resume regression
- v1.9.48 carry-forward regression
- v1.9.50 Firefox playback regression
- v1.9.51 Sync Labs render-stage regression
- v1.9.52 canonical-output regression
- v1.9.53 direct-upload/submission regression
- v1.9.54 transient-provider safety regression
- v1.9.55 split-submit/recovery regression
- v1.9.56 production hardening regression, including live-shape `concurrency_limit_reached` recovery and unrelated-slot busy behavior
- full `.js` / `.mjs` syntax sweep

## Expected simulated warnings
Some regression tests deliberately simulate Gemini quota exhaustion, unavailable Gemini image modes, ElevenLabs fallback behavior, and Sync Labs quota errors. Those console messages are intentional failure-path tests and are not test failures.

## Live-provider limitation
The automated suite uses controlled provider mocks and cannot spend the user's live Sync Labs or ElevenLabs account. The preceding live browser test already proved a genuine Sync Labs synchronized MP4 can be created and served through CineTale. v1.9.56 specifically hardens duplicate prevention and concurrency recovery around that proven path.
