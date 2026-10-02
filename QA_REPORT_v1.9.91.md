# CineTale v1.9.92 QA Report

## Defect addressed
v1.9.90 preserved the existing speaking-source video while **Listen** previewed the approved voice, but the source remained a native controllable video player. Because provider/guide audio is intentionally muted before lip-sync, that UI looked like a finished clip with broken audio.

v1.9.92 separates the unfinished visual source from the finished speaking clip without throwing away already-paid video generation:

- an unsynchronized speaking source remains visually mounted, so **Listen** does not make the previous visual disappear;
- the unfinished source no longer exposes native playback controls and cannot masquerade as the finished audible clip;
- raw/provider guide audio remains blocked;
- when CineTale already owns a valid durable source video, the scene action changes to **Finish clip**;
- **Finish clip** reuses that owned source and runs the exact approved character voice through the existing strict lip-sync contract; it does **not** submit another Veo generation;
- after synchronized media is durably stored and validated, that single synchronized MP4 becomes the normal controllable/audible scene player;
- if finishing dialogue fails, the owned source remains intact and CineTale does not spend another video-generation credit.

New video generation retains the existing end-to-end transaction: source generation -> durable ownership -> exact approved TTS -> lip-sync -> durable synchronized media -> finished player.

## Targeted regression added
`scripts-v1991-finished-speaking-clip-regression.mjs` verifies:
1. durable unsynchronized speaking media offers **Finish clip**;
2. the Finish path calls lip-sync on the owned source instead of Veo;
3. failed Finish preserves the existing source;
4. unfinished speaking media remains visible but is not a native finished player;
5. only the validated synchronized branch exposes normal video controls.

Carry-forward regressions that previously required native controls on an unfinished muted source were updated because that behavior was the direct cause of the user's "no audio" confusion.

## Validation results
Working source:
- Full CineTale script suite: **55/55 passed** (core checks + smoke + deep QA + 52 targeted/regression scripts)
- JavaScript/MJS syntax validation: **79/79 passed**
- Deep QA: **182 static IDs, 461 DOM references, 19 API routes, 3 local assets, 165 files checked**

The test suite includes simulated provider quota/fallback cases. Logged 429/422 provider messages in those tests are expected fixtures and are not live paid calls.

## Browser/live-provider limitation
A headless Chromium launch was attempted, but this container's Chromium process did not complete local `file://` navigation reliably, so no claim is made that the exact deployed Vercel + Firefox/Chromium + live Veo + ElevenLabs + lip-sync provider workflow was physically exercised here. No paid provider generation was triggered during this QA pass.

## Migration
No new SQL migration is required. Existing durable scene-media storage continues to use the private storage setup introduced previously.
