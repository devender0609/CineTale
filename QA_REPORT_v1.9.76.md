# CineTale v1.9.76 QA report

## Release purpose

This release addresses failures reproduced from the creator's uploaded CineTale media rather than relying only on scripted app assertions.

### Uploaded-media evidence

- `cinetale-synced-clip-1.mp4` and `cinetale-synced-clip-2.mp4` are byte-for-byte identical (same SHA-256), proving that two scene slots were associated with the same synchronized asset.
- Clip 1: video 10.041667 s; audio 10.006009 s; both start at 0.
- Clip 2: video 10.041667 s; audio 10.006009 s; both start at 0.
- Clip 3: video 14.958333 s; audio 14.939002 s; both start at 0.
- Clip 4: video 9.916667 s; audio 9.910000 s; both start at 0.
- Clip 5: video 6.000000 s; audio 6.000000 s; both start at 0.
- The uploaded final WebM runs to approximately 150.7 s and contains long detected silence spans of approximately 19.1 s, 21.2 s, 18.4 s, 28.5 s, and 19.0 s while video continues.

These observations support two distinct application defects: duplicate scene-media binding and final-timeline silent padding after synchronized speech has ended.

## v1.9.76 changes

- Adds a final-media integrity gate across selected scenes.
- Detects duplicate source URLs, synchronized generation IDs, synchronized playback URLs, remote synchronized URLs, and (where fetchable) SHA-256 fingerprints of media content.
- One-click final production repairs only the later duplicate scene, preserving unique READY scene assets.
- A duplicate source scene is regenerated and then synchronized; a duplicate synchronized output with a distinct source is re-synchronized without throwing away unrelated scene video.
- Direct final rendering refuses to hide or repeat duplicate media and routes the creator to one-click repair.
- Valid synchronized speaking clips are treated as atomic picture+audio units. Final assembly no longer extends a spoken scene through silent coverage merely to hit a target duration.
- Non-speaking scenes may still use real unique coverage without looping.
- Background video polling is now bound to the project and episode that started the job instead of whichever project happens to be open when the provider responds.
- Existing valid paid lip-sync assets retain `LIP_SYNC_PIPELINE_REV = v1.9.67-scene-semantic-signature`; the release does not invalidate all synchronized assets.
- Final-render metadata advances to pipeline 10 (`atomic-synced-scenes-no-silent-padding`).

## Validation

- 41 / 41 `scripts-*.mjs` regression and QA scripts: PASS.
- JavaScript/MJS syntax checks across the full release tree: PASS.
- Deep QA: PASS (182 static IDs, 462 DOM references, 19 API routes, 135 files checked by the deep-QA script).
- Smoke test: PASS.
- Lip-sync adoption/resume/status resilience tests: PASS.
- Scene-audio regression: PASS.
- Player lifecycle regression: PASS.
- Video MIME/range regression: PASS.
- Voice continuity and clean approved-voice mix regressions: PASS.
- Cloud final-video persistence regression: PASS.
- New v1.9.76 duplicate-media / atomic-synchronized-scene / project-bound-poller regression: PASS.

## What is not claimed

This environment cannot reproduce the creator's exact deployed Firefox/Vercel session or consume live Veo, ElevenLabs, or Sync Labs credits. The uploaded media itself was inspected with FFmpeg/ffprobe, and the defects above were directly evidenced from those files. Exact perceptual mouth-to-phoneme quality for each clip still requires playback/listening in the deployed browser; the release does not claim otherwise.
