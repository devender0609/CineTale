# CineTale v1.9.45 QA Report

## Scope
This release targets the two production defects observed in Scene 5:
1. the Studio video element flickered/disappeared during playback; and
2. the user-visible clip remained the original Google/Veo asset instead of a validated FAL lip-synced result.

## Root-cause findings
- The Studio scene list is rendered with `innerHTML`. Any state-driven Studio rerender can recreate `<video>` elements and Firefox visibly tears down/rebuilds the media pipeline even when the URL is unchanged.
- Earlier lip-sync builds could receive a FAL result but keep the mounted Studio player pinned to the source clip for the whole session, so downloaded/played media could remain the original Google/Veo clip.
- A provider-complete lip-sync result and a browser-playable/validated result were not consistently treated as separate states across Studio playback and final rendering.
- Final assembly could consider a current lip-sync result before browser validation.

## v1.9.45 corrections
- Adds a player-session DOM lock. While a scene video session is active, Studio structural rerenders are deferred instead of replacing the scene-card/video DOM.
- Keeps source switching prohibited during active playback. `adoptSceneLipSyncVideo` refuses to switch while the video is playing.
- A completed FAL result is browser-probed with a separate video element before it is marked validated.
- Existing saved but unvalidated FAL results are revalidated before reuse; this avoids unnecessary repeated paid FAL jobs.
- Only a **validated** lip-sync result can become the primary scene video or final-render video.
- When a validated result becomes ready during playback, the current playback remains untouched. If the playback has already ended, the verified synced asset is adopted for the next replay.
- The ended handler may adopt the validated synced asset and resets playback to the start; it does not hot-swap mid-play.
- Failed synchronized playback restores the original source video.
- FAL provenance is retained (`lipSyncRemoteVideoUrl`, provider `fal-sync`), and Google Generative Language URLs cannot masquerade as synced results.
- Scene UI now distinguishes `Source video`, `Source video · synchronizing…`, `Source video · lip-sync ready for replay`, `Lip-synced video`, and sync-unavailable state without requiring a scene-list DOM rebuild.
- The pipeline revision changed to `v1.9.45-verified-result-stable-player`, invalidating stale older sync signatures.

## Provider contract verification
The implementation was checked against the current fal.ai Sync-3 API schema. The model accepts `video_url`, `audio_url`, and `sync_mode`, and returns a generated `video.url`. The server keeps the FAL key private and only exposes proxied supported result hosts.

## Automated validation run after final code changes
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
  - 177 static IDs
  - 450 DOM references
  - 18 API routes
  - 70 files checked
- `npm run qa:scene-audio` — PASS
- `npm run qa:voice-mix` — PASS
- `npm run qa:lipsync` — PASS
- `npm run qa:player-lifecycle` — PASS
- `node scripts-lipsync-adoption-regression.mjs` — PASS
- `node --check` for app and API JS files — PASS
- `node --check` for all top-level MJS QA scripts — PASS

The smoke suite intentionally exercises simulated Gemini quota failures and an ElevenLabs model fallback. Those messages are expected test-path output and are not failed checks.

## Release acceptance test on production
Because this environment cannot use the user's production Vercel/FAL/ElevenLabs credentials or reproduce their exact Firefox session, the following must be verified after deployment before this build is considered production-proven:
1. Hard-refresh Studio.
2. Scene 5 should display `Source video` before sync is ready.
3. Play Scene 5 once. The same player must remain visible continuously; there should be no DOM/video disappearance during playback.
4. While FAL runs, the label should show `Source video · synchronizing…`.
5. When the verified result is ready, the label should show `Source video · lip-sync ready for replay` if the original playback is still mounted.
6. At/after the end of playback, the verified result should be adopted for the next replay.
7. Replay Scene 5. The label should read `Lip-synced video` and the media URL must resolve to a FAL/storage result through `/api/video-file`, not a `generativelanguage.googleapis.com` source.
8. If FAL fails or its result is not playable, the original source clip must remain visible and usable.

No claim of frame-perfect lip synchronization is made until a real FAL result is observed in the deployed browser.
