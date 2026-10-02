# CineTale v1.10.53 QA Report

## Release
**CineTale v1.10.53 — Terminal Video State & Missing-Asset Recovery RC**

## Production issue reproduced
The deployed v1.10.52 video-status endpoint returned a terminal provider result with:

- `done: true`
- `status: error`
- no downloadable video asset

The user-facing Studio could remain visually stuck in a rendering state because the production state machine did not consistently treat every `done:true` / no-asset result as terminal across manual scene generation, saved-job recovery, automatic scene production, and cinematic coverage production.

## Fixes
- Added explicit terminal status semantics to `/api/video-status`.
- Added `VIDEO_ASSET_MISSING` classification for a completed video operation with no usable returned video file.
- Added extraction support for both documented REST Veo output (`generateVideoResponse.generatedSamples`) and SDK-like `generatedVideos` response forms.
- Added filtered-media diagnostic handling without exposing provider details in normal-user UI.
- Added a shared client `videoStatusTerminalError` gate so `done:true` can never remain in a rendering state unless a valid video asset exists.
- Manual video polling now checks immediately on first pass rather than waiting for the first interval.
- Terminal jobs clear `videoOperation`, `videoQueuedAt`, and pending production metadata.
- Saved/reopened terminal jobs reconcile to a retryable user state instead of resuming endless polling.
- Automatic final-production scene polling uses the same terminal gate.
- Cinematic coverage-shot polling uses the same terminal gate and clears the failed coverage operation.
- User-facing progress is now bounded and nontechnical: `Preparing video…`, `Creating video…`, then `Taking longer than usual…`.
- Missing-asset failure returns to `Try video again` / `Video needs retry` rather than showing indefinite rendering.
- No automatic billable retry is launched after a terminal missing-asset result.

## Regression specific to this release
`scripts-v11053-video-terminal-state-regression.mjs` executes the video-status handler against:

1. official REST Veo generated-sample response with a usable URI;
2. SDK-like `generatedVideos` response with a usable URI;
3. the exact failure class observed in production: `done:true` with no video asset;
4. filtered-media terminal completion;
5. a true in-progress `done:false` operation.

It also checks all primary client polling paths for terminal-state cleanup and retry UX.

## Full source validation
- 119/119 app regression/runtime/QA scripts passed.
- 143/143 JavaScript/MJS files passed `node --check` syntax validation.
- `scripts-check.mjs` passed.
- `scripts-smoke.mjs` passed.
- `scripts-deep-qa.mjs` passed.
- Existing scene audio, voice, lip-sync, player lifecycle, final-render, durable-media, navigation, identity, story-shot, and production-contract regressions passed.

## Live-provider caveat
The automated smoke suite exercised provider error/fallback handling and encountered the already-known image quota/delivery-mode and ElevenLabs fallback test conditions. No fresh billable Veo generation was intentionally launched solely for packaging QA. Therefore this release validates the terminal-state handling logic and response parsing, but does not claim a newly completed paid Veo clip in the QA environment.

## Expected deployment behavior
When the same persisted failed video operation is reopened under v1.10.53, CineTale should check its saved operation, recognize the terminal no-asset result, clear the stale rendering state, and present a safe retry action. It must not continue polling indefinitely and must not automatically submit another paid video job.
