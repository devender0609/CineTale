# CineTale v1.9.51 QA Report

## Release focus

v1.9.51 changes CineTale lip synchronization from a browser-timed playback feature into a provider-rendered production stage.

For speaking scenes, CineTale now sends the existing source video together with the final approved ElevenLabs dialogue audio to a dedicated lip-sync renderer. When `SYNC_API_KEY` is configured, the preferred provider is Sync Labs `sync-3`. The provider returns one finished video with synchronized mouth motion and the approved audio embedded. CineTale validates that returned asset before it can become the scene's primary playback/final-assembly video.

The prior FAL path remains available as an optional fallback when configured.

## Production safeguards

- Source Veo video is preserved and never overwritten.
- The synchronized output must be distinct from the original source.
- Only supported provider media hosts are accepted for persisted synchronized output.
- Provider output is browser-preflighted before adoption.
- Active playback is not destroyed to swap media mid-play.
- Provider/debug lip-sync status text is not rendered on top of user video.
- Studio playback, sequence preview, and final rendering resolve the validated synchronized scene asset first.
- Existing responsive no-horizontal-scroll final-assembly layout is preserved.
- Existing Firefox-safe native playback and approved-audio fallback remain in place.

## Sync Labs integration validated locally

A mocked integration regression exercises the production request/response contract:

- `POST https://api.sync.so/v2/generate`
- API key supplied with `x-api-key`
- model `sync-3`
- source video passed as a URL input
- final approved dialogue supplied as the audio file in multipart form data
- active-speaker auto-detection enabled for video input
- returned generation ID persisted
- `GET /v2/generate/{id}` completion status parsed
- completed `outputUrl` persisted as a distinct `sync-labs` synchronized asset
- output is routed through CineTale's video proxy and browser validation before adoption

## Final regression results

- `npm run check` — PASS
- smoke suite — PASS
- deep QA — PASS
- 177 static UI IDs checked
- 451 DOM references checked
- 18 API routes checked
- 82 project files checked
- scene audio/video regression — PASS
- approved voice mix regression — PASS
- dedicated lip-sync/fallback regression — PASS
- stable player lifecycle regression — PASS
- lip-sync status resilience regression — PASS
- provider adoption/resume regression — PASS
- proactive lip-sync + no-scroll final assembly regression — PASS
- Firefox playback/approved-audio carry-forward regression — PASS
- new v1.9.51 Sync Labs render-stage regression — PASS
- syntax check of every `.js` and `.mjs` file — PASS

The Gemini quota and ElevenLabs model fallback messages emitted by some regression tests are intentional simulated failure-path tests and are not failing test results.

## Live-provider limitation

The production Sync Labs result cannot be visually verified from this build environment because the user's live `SYNC_API_KEY`, Vercel deployment, Firefox session, and billable provider execution are not available here. Therefore this report does **not** claim that a production Scene 5 result has already been visually confirmed frame-perfect.

After deployment, live verification should confirm that Scene 5 produces a new Sync Labs output asset, that the output is different from the Google/Veo source, that approved dialogue is embedded in the returned video, and that visible mouth movement matches the approved audio.

## Required Vercel variables for the recommended production route

```text
ENABLE_LIVE_LIPSYNC=true
LIPSYNC_PROVIDER=sync-labs
SYNC_API_KEY=<your Sync Labs API key>
SYNC_LIPSYNC_MODEL=sync-3
```

`FAL_KEY`, `LIPSYNC_MODEL`, and `LIPSYNC_SYNC_MODE` can remain configured as an optional fallback route.
