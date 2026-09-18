# CineTale Studio v1.9.1 — Video 429 Reliability QA

## Scope
This release is a targeted reliability hotfix on top of v1.9.0. It addresses the live single-scene `/api/video-job` path after a real deployed Vercel request reached Google Generative Language and returned HTTP 429.

## Root cause found
- The single-scene **Generate video clip** path did not send `allowQualityFallback`, while automatic final production did.
- As a result, a Standard/Draft scene could fail immediately on the preferred Veo route instead of attempting the efficient Veo 3.1 Lite route.
- Direct REST calls also lacked bounded retry/backoff around transient 429/5xx responses.

## v1.9.1 changes
- Single-scene video requests now enable quality fallback for Draft and Standard tiers; Premium remains on the requested premium route.
- `api/video-job.js` now retries transient 408/425/429/5xx responses with bounded exponential backoff plus jitter.
- Provider `Retry-After` / retry delay hints are parsed and respected when short enough to retry safely inside the request.
- If the preferred Standard/Draft route remains quota-limited, CineTale tries `veo-3.1-lite-generate-preview`.
- Persistent 429 responses return a stable `VIDEO_QUOTA` code plus `retryAfterSeconds` and a creator-friendly message while preserving provider diagnostics separately.
- Scene UI temporarily disables video generation during a returned cooldown and preserves the storyboard, cast and all completed work.

## Validation performed
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- `node --check` across every `.js` / `.mjs` file — PASS
- Existing deep QA inventory — 173 static IDs, 392 DOM refs, 12 API routes, 3 local assets, 33 files — PASS
- Dedicated runtime test: preferred Veo route returns 429 with Retry-After; Lite fallback returns queued operation — PASS
- Dedicated runtime test: both preferred and Lite routes return 429; API returns `VIDEO_QUOTA` and provider cooldown — PASS

## Expected deployed behavior
For a Standard scene, one click on **Generate video clip** now:
1. submits to the configured preferred Veo model;
2. safely retries transient failures;
3. if quota-limited, attempts Veo 3.1 Lite;
4. if Google still refuses both routes, preserves the scene and shows a temporary cooldown instead of encouraging repeated clicks.

## Important external limitation
No application code can bypass a project-level or account-level Google quota that is actually exhausted. v1.9.1 fixes CineTale's retry/fallback behavior and user experience around that condition. If Google rejects both the preferred and Lite model because the underlying project has no available video quota, the account/project quota must recover or be increased before a live Veo job can start.
