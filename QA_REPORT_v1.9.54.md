# CineTale v1.9.54 QA Report

## Release purpose
Harden the Sync Labs Sync-3 submission path after live Firefox/Vercel testing showed `POST /api/lipsync-job` returning HTTP 503 before a Sync Labs generation ID was created.

## Root-cause assessment
Sync Labs documents HTTP 503/504 at generation submission as transient provider/controller/dependency failures and recommends exponential backoff while honoring `Retry-After`. The v1.9.53 server route preserved the 503 correctly, but treated it as terminal and did not retry. That meant a temporary Sync Labs service-side failure could prevent any generation from being created and CineTale would continue using the original Veo source.

## v1.9.54 changes
- Keeps direct multipart upload of both source video and approved dialogue audio to `POST https://api.sync.so/v2/generate`.
- Uses documented `sync-3` model and JSON-encoded multipart `options` with `sync_mode: silence` and active speaker auto-detection.
- Adds bounded automatic retry for submit-time 500/503/504 failures.
- Adds controlled retry for retryable 429 rate/concurrency responses only; quota exhaustion is not retried.
- Honors `Retry-After` when supplied, with a bounded wait suitable for the server route.
- Recreates the multipart `FormData` body for every retry attempt so file streams/blobs are never reused incorrectly.
- Preserves provider `errorCode`, request id/details, and HTTP status when submission still fails.
- Adds `submitAttempts` to successful job responses for diagnostics.
- Advances the lip-sync pipeline revision so an earlier v1.9.53 terminal submission failure gets one fresh attempt after deployment.
- Does not alter the already-stable scene-player lifecycle, approved-audio playback, canonical Sync Labs result route, or final-episode no-scroll layout.

## Regression coverage
All of the following passed after the final source changes:
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
- `npm run qa:v1951`
- `npm run qa:v1952`
- `npm run qa:v1953`
- `npm run qa:v1954`
- syntax check of all `.js` and `.mjs` files

Deep QA result: 177 static UI IDs, 451 DOM references, 19 API routes, 3 local assets, 89 files checked.

## New v1.9.54 dynamic regression
The new regression executes the real server handler with mocked network boundaries and verifies:
1. a first Sync Labs 503 `controller_unavailable` response;
2. a retry using a newly-created multipart request body;
3. successful 201 generation creation on the second attempt;
4. preservation of `submitAttempts: 2`;
5. a `generation_quota_exceeded` 429 is not retried;
6. the provider request id and machine-readable error code remain available.

## Important live-production limitation
The live Sync Labs account cannot be exercised from the build environment because the user's production `SYNC_API_KEY` is not available here. Therefore v1.9.54 validates the request contract and transient-failure handling, but a real Sync-3 render must still be confirmed after deployment. If the live provider continues returning 503 after the bounded retries, that indicates a Sync Labs service/dependency condition rather than a successful generation; CineTale will surface the provider details instead of claiming lip-sync succeeded.
