# CineTale v1.10.56 QA Report

## Release focus
Duplicate-safe cinematic coverage submission and retry after recovered/failed coverage jobs.

## Root cause fixed
v1.10.55 correctly released persisted failed coverage jobs, but a retry could append a second `coverageClips` row with the same `shotId`. The lookup returned the older stale row first, so the newly returned provider operation could not be found and the UI reported: `The cinematic coverage job could not be started.`

v1.10.56 replaces append-only coverage submission with a canonical upsert, removes duplicate rows for the same shot during submission, and makes coverage lookup prefer the authoritative active/usable entry. The same path is used across scenes, so this is not a scene-specific patch.

## Credit safety
The usage counter is incremented only after the video endpoint returns an immediate video or a provider operation. Recovery itself does not submit a new job. A failed retry does not create duplicate in-memory coverage rows.

## Validation on source tree
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- regression/runtime/QA scripts (excluding the three umbrella commands above): 119/119 PASS
- JS/MJS syntax: 146/146 PASS
- deep QA: 188 static IDs, 475 DOM references, 19 API routes, 297 files checked

## Exact packaged ZIP validation
The release ZIP was extracted to a clean directory and the same checks were repeated. See packaging notes in the release response.

## Live-provider limitation
No additional billable Veo generation was intentionally launched solely for packaging QA. Provider behavior, quotas, and returned media remain external to the static/local test environment. Existing image-route quota/fallback and TTS fallback conditions may appear during broad regression tests and are not represented as newly verified provider success.
