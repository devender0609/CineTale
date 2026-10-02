# CineTale v1.9.89 QA Report

## Release focus
Fix the user-visible silent-video failure after successful Veo generation and durable storage.

The deployed screenshot showed the source MP4 being fetched successfully from CineTale and Supabase (HTTP 200) while the visible player remained muted. That is consistent with CineTale correctly suppressing provider/source speech but exposing the intermediate source video before the authoritative lip-synchronized result was ready.

## Product behavior changed
- A user-triggered speaking-video generation is now treated as one end-to-end production transaction:
  source video generation -> durable source ownership -> exact approved TTS -> lip-sync -> durable synchronized ownership -> visible/audible player.
- Intermediate speaking source video is no longer mounted as a normal-user silent video player.
- While a speaking source is waiting for lip-sync, Studio keeps the storyboard/poster surface instead of showing an apparently broken muted movie.
- Direct video generation remains in a `Finalizing dialogue…` state until the synchronized result is validated.
- Background Veo completion now continues through dialogue synchronization before declaring the speaking scene ready.
- On successful lip-sync, only that scene is refreshed and the durable synchronized media becomes the authoritative player.
- If synchronization fails, CineTale does not present the silent provider/source video as a finished clip.
- Existing durable-media ownership, strict scene/character/dialogue/voice provenance, no-flicker scene-local refresh, and final-render sync gates are preserved.

## Validation performed on working source
- Full `scripts*.mjs` regression/smoke/deep-QA set: **53/53 PASS**.
- JavaScript/MJS syntax validation: **77/77 PASS**.
- New dedicated regression: `scripts-v1989-end-to-end-speaking-clip-regression.mjs` PASS.
- Updated stale regressions that previously required the intentionally removed silent source-preview behavior.

## Live-provider limitation
No new Veo, ElevenLabs, or lip-sync provider generation was executed from this container. The release verifies the application control flow, media-state gates, persistence contracts, and packaged code, but the user's deployed provider credentials/runtime must still confirm a new synchronized clip end-to-end.
