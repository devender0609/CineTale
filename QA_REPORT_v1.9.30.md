# CineTale v1.9.30 QA Report

## Scope
This build is intentionally limited to the two confirmed live regressions from v1.9.29:

1. scene video playback reporting an unsupported format/MIME type in Firefox;
2. the **Regenerate clip** control appearing unresponsive after a scene already had a video URL.

No unrelated product workflow was intentionally redesigned.

## Changes verified
- Scene video action is handled from the persistent `#sceneList` container so a scene rerender cannot swallow the click.
- An active `videoOperation` now visibly overrides the stale ready state: the control shows **Rendering…**, is disabled against duplicate submits, and the scene tag reports **Rendering replacement** when an older clip is still displayed.
- The existing prior clip is retained until the replacement succeeds, so a failed regeneration does not destroy completed work.
- `/api/video-file` no longer blindly labels an unknown container `video/mp4` on HEAD or non-zero byte-range requests.
- The proxy probes the beginning of an unknown upstream asset and caches/delivers the detected container type (MP4/WebM/QuickTime) consistently for HEAD and range responses.
- Byte-range responses preserve `206`, `Content-Range`, `Content-Length`, and `Accept-Ranges` semantics.

## Automated validation
Executed from the packaged v1.9.30 source:

- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- `node --check app.js` — PASS
- `node --check api/video-file.js` — PASS
- dedicated video MIME/range regression harness — PASS
  - generic upstream HEAD + WebM probe => `video/webm`
  - non-zero `206` byte range + generic upstream MIME => `video/webm`
  - `Content-Range` and `Content-Length` preserved
- 177 static IDs checked
- 442 DOM references checked
- 16 API routes checked

The smoke run also exercised existing negative-path simulations for visual-provider quota/delivery and ElevenLabs model fallback; those expected simulated errors did not fail the suite.

## Production acceptance still required
This environment cannot use the user's production Veo asset or reproduce the user's exact signed-in Firefox media stack. Therefore I am **not** claiming live Firefox playback is verified until one real generated clip is played after deployment.

After deployment, verify `Settings → System Health → App build: v1.9.30`, then test one existing clip and one **Regenerate clip** action. The regenerate control should change immediately to **Rendering…** on the first click.
