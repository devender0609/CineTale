# CineTale v1.9.55 QA Report

## Release focus

The live v1.9.54 evidence showed `/api/lipsync-job` remaining open for roughly a minute and ending in HTTP 502 while Scene 5 continued to fall back to the original Google/Veo MP4. v1.9.54 performed multiple Sync Labs submit retries inside one serverless function invocation. v1.9.55 removes that long-lived retry architecture.

### Root-cause hardening

- One `/api/lipsync-job` invocation now performs **at most one** Sync Labs `POST /v2/generate` request.
- Provider 500/503/504 and retryable 429 responses return a structured **HTTP 200 retryable state** to the browser instead of holding the Vercel function open through multiple retries.
- Browser retries happen as **separate serverless requests** with bounded backoff.
- Every submission uses a deterministic `outputFileName` derived from the scene lip-sync signature.
- Before any new Sync Labs POST, CineTale checks recent Sync generations for that deterministic filename and resumes a matching PENDING/PROCESSING/COMPLETED generation when found.
- If the provider connection closes after upload and the outcome is ambiguous, CineTale checks Sync generations again before allowing another POST. This addresses Sync Labs' warning not to blindly retry ambiguous submissions when no public idempotency key exists.
- Direct video + approved audio multipart upload is retained.
- Terminal provider errors such as quota exhaustion remain terminal and preserve their provider status/error code.
- Stable scene playback, validated-output adoption, approved-audio behavior, canonical Sync Labs video routing, and responsive final assembly remain unchanged.

## Dynamic v1.9.55 regression scenarios

1. Provider returns 503: server route returns a structured `retryable` state after exactly one provider POST.
2. Next browser retry: a new server invocation checks existing generations, then submits only if no matching generation exists.
3. Ambiguous network failure after upload: deterministic output filename recovery finds the already-created generation, avoiding a duplicate POST.
4. Quota exhaustion 429: remains terminal and is not retried.

## Full release gate

- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- `npm run qa:scene-audio` — PASS
- `npm run qa:voice-mix` — PASS
- `npm run qa:lipsync` — PASS
- `npm run qa:player-lifecycle` — PASS
- `npm run qa:lipsync-status` — PASS
- `npm run qa:lipsync-adoption` — PASS
- carry-forward v1.9.48 regression — PASS
- Firefox playback regression — PASS
- Sync Labs render-stage regression — PASS
- canonical Sync Labs output/adoption regression — PASS
- direct-upload/submission regression — PASS
- **v1.9.55 split submit/recovery regression — PASS**
- JavaScript/MJS syntax sweep — PASS
- Deep QA: **177 static IDs, 451 DOM references, 19 API routes, 91 files checked**

The Gemini quota, unsupported-image-delivery, ElevenLabs fallback, and Sync quota messages printed during regression execution are intentional simulated failure-path fixtures; the corresponding assertions passed.

## Live-provider limitation

The sandbox cannot execute the user's production Sync Labs account or Vercel deployment. Therefore this report does **not** claim that a real Sync-3 scene has completed. The first production acceptance gate is: `/api/lipsync-job` must return quickly with either a generation ID or a structured provider state, rather than remaining open for about a minute and ending as a generic 502. Once a generation ID exists, the existing status/adoption path must deliver a distinct synchronized MP4.
