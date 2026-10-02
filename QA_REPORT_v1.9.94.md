# CineTale v1.9.94 QA Report — Embedded Audio Recovery

## Live evidence supplied by user
The uploaded 8-second `.m4v` contains H.264 video plus a stereo AAC audio stream (48 kHz, ~140 kb/s). FFmpeg volume analysis found real non-silent audio (mean about -28.1 dB, peak about -7.2 dB). This proves the supplied media file itself is not silent.

## Root cause fixed
`recoverMountedSceneMedia()` previously compared a hydrated durable runtime URL (often `blob:`) to `scene.lipSyncVideoUrl` (the provider/remote URL). Even when both represented the same synchronized clip, their strings differ. The recovery path therefore could classify the synchronized file as an unsynchronized source and set `video.muted=true`.

v1.9.94 now identifies a recovered synchronized asset by CineTale's validated hydrated sync runtime URL. A validated sync is explicitly restored to `muted=false`, `defaultMuted=false`, no `muted` attribute, and `volume=1`. The player binding/play path has the same invariant, so generic speaking-scene protection cannot re-mute a finished synchronized player.

## Release claim boundary
Static/regression/syntax/package checks can verify the logic. No claim is made that live deployed browser/provider playback is successful until one existing synchronized speaking scene is tested after deployment. No new Veo/lip-sync generation is required for this test.
