# CineTale v1.10.60 — Transient Veo Failure Classification & Safe Manual Retry RC

## Live evidence that drove this release
The deployed v1.10.59 build successfully recovered the previously stuck Scene 2 / Shot 1 and showed it READY/playable. A controlled fresh Scene 2 / Shot 2 generation then reached the provider and returned a terminal provider error:

- `status: "error"`
- `done: true`
- `terminal: true`
- `errorCode: "VIDEO_PROVIDER_FAILED"`
- provider message: `Video generation failed due to an internal server issue. Please try again in a few minutes.`
- v1.10.59 incorrectly normalized that temporary provider condition as `retryable: false`.

This is a distinct condition from the earlier stuck-rendering and duplicate-coverage-record defects. The provider operation itself terminated with an explicit temporary/internal failure.

## v1.10.60 changes
- `/api/video-status` now classifies temporary provider failures as manual-retryable when Google reports INTERNAL, UNAVAILABLE, DEADLINE_EXCEEDED, ABORTED, matching RPC codes, or clearly temporary/internal-service wording.
- Permanent request errors remain non-retryable.
- Terminal provider failure remains terminal: CineTale stops polling and clears the active GENERATING operation.
- No automatic paid video retry is launched.
- User-facing copy for retryable provider failures is nontechnical: the project is safe and the creator can retry the shot in a few minutes.
- Retryability is persisted through primary-shot, cinematic-coverage, project-open recovery, background recovery, and automatic-production terminal-error paths.
- Retryability metadata is cleared on a new submission or successful completion.
- Existing v1.10.59 canonical coverage-operation reconciliation remains intact.

## Regression added
`scripts-v11060-transient-video-provider-failure-regression.mjs` reproduces the live failure contract and verifies:

1. Google INTERNAL / code 13 -> `VIDEO_PROVIDER_FAILED`, terminal, `retryable:true`.
2. Google UNAVAILABLE / code 14 -> `retryable:true`.
3. Permanent INVALID_ARGUMENT -> `retryable:false`.
4. Client user-facing temporary-failure copy is present.
5. Retryability metadata is preserved in both primary and coverage terminal-state handling.

## Source-tree validation
- Script-level regression/runtime/QA checks: **126/126 PASS**
- JavaScript/MJS syntax: **150/150 PASS**
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Deep QA inventory: **188 static IDs, 475 DOM references, 19 API routes, 3 local assets, 306 files checked**

Smoke/deep QA exercised the existing provider fallback/error paths. The environment reported known Gemini image quota/delivery-mode conditions and ElevenLabs fallback behavior; these did not fail the suite.

## Billing / provider limitation
No additional paid Veo generation was intentionally launched for packaging QA. The live Shot 2 response already established the real provider error shape. v1.10.60 validates classification, terminal cleanup, manual-retry semantics, and no-auto-retry behavior synthetically and through the full regression suite.

## Acceptance expectation
For this exact provider-internal failure, CineTale should stop rendering, return Shot 2 to a usable retry state, preserve the failure evidence, and allow a creator-initiated retry later. It must not continue polling indefinitely and must never automatically submit a replacement paid video job.
