# CineTale v1.9.53 QA Report

## Production failure investigated
Live Firefox/Vercel evidence showed Scene 5 remaining on the original Google/Veo clip while repeated `POST /api/lipsync-job` requests failed before a Sync Labs generation ID was created. The synchronized-output adoption path therefore never had a real Sync-3 asset to adopt.

## Submission-path hardening
- For source scene clips under 19 MB, `/api/lipsync-job` now fetches the scene video server-side and uploads the **video file bytes** directly to Sync Labs together with the approved dialogue audio file.
- When the source scene is CineTale's `/api/video-file?uri=...` proxy, the server resolves the upstream media URL and fetches it with the required Gemini key when applicable. Sync Labs no longer needs to crawl the nested CineTale proxy for normal short clips.
- Oversized or server-unfetchable clips fall back to Sync Labs' documented mixed input mode: direct audio file + video URL.
- Provider HTTP status, `errorCode`, and structured provider details are preserved. Known provider statuses such as 401/403/409/422/429/503/504 are no longer flattened into a generic 502.
- Terminal submission failure is persisted for the current lip-sync signature so Studio does not repeatedly resubmit the same failing request on every refresh/render.
- Pipeline revision advanced to `v1.9.53-direct-sync-upload`, so upgrading from v1.9.52 permits one fresh attempt for the current Scene 5.
- Existing canonical Sync Labs generation-backed playback through `/api/lipsync-video?provider=sync-labs&id=<generationId>` remains in place for completed generations.

## Regression added
`scripts-v1953-regression.mjs` dynamically verifies:
1. CineTale resolves the proxied Google source video server-side.
2. Sync Labs receives direct `video` and `audio` multipart file fields for the short-clip path.
3. The request uses `sync-3`, `sync_mode: silence`, and active-speaker auto-detection.
4. Successful Sync Labs submission returns and persists a generation ID.
5. A simulated Sync Labs quota failure preserves HTTP 429 and `generation_quota_exceeded` instead of becoming a generic 502.
6. Same-signature terminal submission failures are guarded against automatic repeated retries.

## Release gate results
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS: 177 static IDs, 451 DOM references, 19 API routes, 88 files checked
- scene audio/video regression — PASS
- approved voice mix regression — PASS
- dedicated lip-sync/fallback regression — PASS
- stable player lifecycle regression — PASS
- lip-sync status resilience regression — PASS
- Sync/FAL adoption + resume regressions — PASS
- proactive lip-sync + no-scroll final assembly carry-forward — PASS
- Firefox approved-audio playback regression — PASS
- Sync Labs render-stage regression — PASS
- canonical Sync Labs output/adoption regression — PASS
- v1.9.53 direct-upload/submission regression — PASS
- JS/MJS syntax sweep — PASS

## Live-provider limitation
The production Sync Labs account/API key is not available inside this build environment. Therefore this release **does not claim that a real billable Sync-3 generation has completed successfully**. It verifies the request shape against current Sync Labs documentation, dynamically exercises the multipart submission path with controlled provider responses, and preserves real provider error details so the next production test will distinguish account/plan/provider problems from CineTale code defects.
