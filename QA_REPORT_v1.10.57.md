# CineTale v1.10.57 — Complete Veo Asset Contract Recovery RC

## Release focus
Shared live video-generation lifecycle, specifically terminal Veo asset extraction and safe adoption of completed generated files.

## Root cause demonstrated
v1.10.56 treated a completed Veo operation as READY only when the generated video exposed one of these fields: `uri`, `videoUri`, `fileUri`, or `url`.

The current Google GenAI downloadable-file contract also exposes `downloadUri` and a generated file resource `name` (for example `files/<id>`), and SDK download surfaces can operate from a file object/name. v1.10.56 did not parse those forms. A completed operation carrying a downloadable file object in one of those supported forms could therefore fall through to `VIDEO_ASSET_MISSING`, matching the observed terminal failure class even though a generated file was available.

## Fix
- `/api/video-status` now recognizes:
  - documented REST Veo `response.generateVideoResponse.generatedSamples[].video`
  - SDK-like `response.generatedVideos[].video`
  - `generateVideosResponse.generatedVideos[]`
  - `result.generatedVideos[]` envelopes
  - `uri`, `downloadUri`, `download_uri`, `videoUri`, `fileUri`, and `url`
  - generated file resource names such as `files/<id>`, converted to the authenticated Gemini download endpoint
- True `done:true` operations without any usable asset still terminate as `VIDEO_ASSET_MISSING` and never auto-submit a replacement paid job.
- `done:false` remains processing and preserves the original operation.
- Existing duplicate-safe coverage upsert/recovery behavior is retained.
- App, production gate, package version, and browser cache-busting references were advanced together to v1.10.57.

## New regression
`scripts-v11057-video-asset-contract-regression.mjs` executes `/api/video-status` against:
1. official REST generated-sample URI;
2. SDK-style generatedVideos URI;
3. generated-file `downloadUri`;
4. generated-file `name: files/<id>`;
5. `result.generatedVideos` envelope;
6. terminal no-asset completion;
7. genuine in-progress operation.

All pass.

## Full source validation
- regression/runtime/QA scripts: 120/120 PASS
- JavaScript/MJS syntax: 147/147 PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- deep QA: 188 static IDs, 475 DOM refs, 19 API routes, 3 local assets, 300 files checked

## Provider/environment observations during QA
Broad QA encountered the existing synthetic/provider-fallback test conditions for Gemini image quota/delivery mode and ElevenLabs fallback. These did not fail the regression suite.

## Live-provider limitation
No fresh billable Veo generation was intentionally launched solely for packaging QA. Therefore v1.10.57 demonstrates and fixes the response-contract defect locally/synthetically and validates the full application regression surface, but it does not claim a newly completed paid Veo render from the production account during packaging.

## Credit safety
- No automatic new Veo submission occurs during recovery of an existing operation.
- Terminal no-asset results release rendering state rather than looping indefinitely.
- A completed downloadable file in the newly supported forms is adopted instead of being mistaken for a failed job.
- Existing operation preservation and duplicate-safe coverage logic remain in place.
