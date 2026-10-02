# CineTale v1.9.46 QA Report

## Production defect reproduced
The deployed v1.9.45 flow successfully submitted `/api/lipsync-job` (HTTP 200) but `/api/lipsync-status` returned HTTP 502 with `{ "error": "[object Object]" }`. This permanently marked the scene as `lip-sync unavailable` after the first failed poll even though the paid FAL job could still be valid and processing.

## Root cause
`api/lipsync-status.js` threw provider `detail` / `error` values directly. When the provider returned a structured error object, JavaScript coerced it to `[object Object]`. More importantly, any transient non-2xx queue response (including an immediate post-submit 404/409/429/5xx or a network hiccup) became a 502 response to the browser. The front end treated that response as a permanent lip-sync failure instead of continuing to poll the same job.

## v1.9.46 changes
- Added safe structured provider-error serialization; `[object Object]` is no longer emitted.
- Added resilient FAL queue polling. Retryable 404/408/409/425/429/5xx responses now return `status: processing` rather than poisoning the scene.
- Network failures while polling are also treated as transient and keep the existing job alive.
- 401/403 and other terminal provider rejections are surfaced as deliberate `status: error` responses with readable messages.
- The status endpoint now accepts and validates `requestId` and `model` and can reconstruct canonical FAL queue status/result URLs if required.
- When FAL reports `COMPLETED`, the status endpoint follows the provider's returned `response_url` when valid and then validates that the output is a supported FAL/storage video asset.
- The browser now sends `requestId` and `model` on every status poll in addition to the provider URLs.
- The existing v1.9.45 stable-player protections remain intact: no active scene-player DOM replacement, no mid-play source swap, and source-video fallback remains available.
- Lip-sync pipeline revision advanced to `v1.9.46-resilient-fal-status`, so stale prior results are not mistaken for current output.

## Added regression
`scripts-lipsync-status-resilience.mjs` reproduces the production failure shape and verifies:
1. A provider 404 with structured `detail` remains `processing` and does not return `[object Object]`.
2. A polling network failure remains retryable.
3. A terminal authentication rejection becomes a readable stable error.
4. A completed queue job still resolves to a proxied, provider-verified FAL video.

## Full validation completed after final changes
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS (177 static IDs, 450 DOM references, 18 API routes, 3 local assets, 72 files)
- `npm run qa:scene-audio` — PASS
- `npm run qa:voice-mix` — PASS
- `npm run qa:lipsync` — PASS
- `npm run qa:player-lifecycle` — PASS
- `npm run qa:lipsync-status` — PASS
- `node scripts-voice-continuity.mjs` — PASS
- `node scripts-video-regression.mjs` — PASS
- Syntax check across `app.js`, API JS, library JS, and all MJS QA scripts — PASS

The Gemini quota/fallback and ElevenLabs fallback messages printed during deep QA are intentional mocked failure-path tests, not failing checks.

## Live-provider limitation
This environment cannot execute the user's production Vercel deployment with the user's FAL credential. Therefore the production FAL queue cannot be claimed live-verified here. The exact 502/error-shape observed in Firefox was reproduced in the regression harness and the server-side failure mode was fixed. Production verification should confirm that the same Scene 5 job now progresses through `lipsync-status` without a 502 and eventually displays `Lip-synced video` if FAL completes successfully.
