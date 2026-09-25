# CineTale v1.9.80 — Approved-Audio Review + Resilient Scene Media Release Gate

## Why this build exists
v1.9.79 exposed two production problems during creator testing:
1. Speaking source previews were intentionally muted while lip-sync provenance was untrusted, but the approved CineTale dialogue was not attached to those previews. This made every unsynchronized speaking clip appear silent.
2. A saved Scene 5 source produced Firefox's "No video with supported format and MIME type found" message even though the supplied reference Clip 5 itself is a valid H.264/AAC MP4. The Studio had no resilient scene-level fallback when a saved primary URL became unavailable.

## Fixes
- Unsynchronized speaking clips remain native-control, clickable source previews.
- Provider/source audio stays hard-muted, but approved CineTale dialogue now plays through the existing scene-bound WebAudio path and follows video currentTime/seeking.
- An approved-audio failure never restores provider/source speech. The source remains muted and the user receives a clear warning instead.
- Studio now keeps a per-scene fallback registry. If the mounted sync or primary source fails, it can move to another saved coverage clip for that same scene without changing another scene.
- A failed synchronized URL records a lip-sync playback failure before fallback.
- A scene with no remaining playable saved source is marked `media-unavailable` / `Video needs repair` instead of being silently treated as healthy.
- Unsynchronized speaking media is labeled `Source preview + approved voice` so it is not confused with validated lip-sync.
- Final-production readiness is unchanged: speaking scenes still require a validated synchronized asset before final assembly.

## Media evidence used
The creator-supplied `cinetale-synced-clip-5(1).mp4` was inspected with ffprobe. It contains H.264 video plus AAC audio; both streams start at 0.000 seconds and run exactly 6.000 seconds. That supports treating the browser MIME failure as an app URL/recovery problem rather than a codec/timing defect in that supplied file.

## Automated release gate
- All `scripts-*.mjs`: 45/45 PASS.
- JavaScript/MJS syntax checks: 69/69 PASS.
- Deep QA: PASS (182 static IDs, 463 DOM references, 19 API routes, 144 files before removal of temporary browser harness assets).
- Dedicated v1.9.80 regression covers approved-audio review mode, source fallback, provider-audio suppression, version/cache busting, and creator-facing state labels.
- Existing scene-isolation, lip-sync provenance, player lifecycle, final-render, cloud-persistence, MIME/range, voice continuity, and voice-mix regressions all pass.

## Browser-level limitation
A real headless Chromium interaction harness was attempted with generated local MP4/WAV fixtures, but Chromium did not complete reliably in this container. No claim is made that deployed Firefox/Vercel interaction was physically reproduced here. The source of the v1.9.79 silence was directly identified in code (the sync-gated early return), removed, and protected by regressions. Live Vercel/provider verification remains the deployment acceptance step.
