# CineTale v1.9.81 — Professional timed-shot media foundation

This release changes CineTale's media behavior toward the product goal: one story can become a polished story, audio experience, short, episode or movie without pretending that an unsynchronized source clip is a finished performance.

## v1.9.81 release changes

- Scenes now receive an explicit timed shot plan (`startSec`, `endSec`, `durationSec`) whose shots cover the full story beat without modulo-looping a short clip.
- Dialogue turns preserve speaker and line order in the shot plan; each planned speaking turn is tied to its exact speaker/text.
- Veo duration selection now follows the planned shot duration and maps to supported 4/6/8-second generation windows.
- Unsynchronized source video is visual review only. The player never layers detached browser-timed TTS over unrelated mouth motion. Use **Listen** to review the approved voice; finished speaking playback comes only from a validated synchronized clip.
- Playable video surfaces carry no technical/status badge such as “Source preview + approved voice.” Technical/provider details stay outside the movie frame or in owner diagnostics.
- Video `ended` no longer hot-swaps sources or remounts Studio, eliminating a major flicker path.
- Completion of one provider video job patches only that scene's media element instead of rebuilding every scene card.
- Final assembly orders unique media by the timed shot plan, uses each clip at most once, and admits embedded speech only from the validated synchronized timeline entry.
- ElevenLabs v3 no longer receives generic performance tags on every natural line; strong audio tags are reserved for clearly requested emotional directions to reduce over-directed delivery.
- No database/SQL migration is required beyond the existing one-time final-video storage setup introduced earlier.

The release gate includes the full carry-forward regression suite plus `scripts-v1981-professional-timeline-regression.mjs`, syntax validation, ZIP integrity, and a second run against the extracted package. Live Vercel/Firefox/provider behavior still requires deployment verification and is never claimed when it was not actually run.

## v1.9.75 final-video persistence setup

CineTale v1.9.75 keeps the browser final-video copy and can also persist signed-in creators' final videos in private Supabase Storage. Run `SUPABASE_FINAL_VIDEO_STORAGE_SETUP.sql` once in the same Supabase project used by CineTale Auth. The bucket is private and RLS limits each signed-in user to their own UID folder.

If the bucket is not installed, final rendering still completes and the app keeps the browser-local copy, but the UI will accurately identify it as browser-only persistence.


## v1.9.76 media integrity

Final rendering now treats each validated synchronized speaking clip as an atomic picture+audio unit, does not pad it with silent coverage, detects duplicate source/synchronized media across different scenes (including content fingerprints when accessible), repairs only the later duplicate scene during one-click production, and binds background video polling to the project/episode that started the job. Existing valid synchronized assets keep the same lip-sync semantic revision.

## v1.9.81 scene-audio provenance and safe recovery

- A synchronized scene is no longer trusted merely because its saved MP4 is playable. CineTale now preserves the exact scene semantic signature and a SHA-256 fingerprint of the approved audio submitted for lip-sync.
- Legacy synchronized assets that an older build marked as “recovered” without proving dialogue compatibility are intentionally blocked from READY and rebuilt only when final production actually needs them. This prevents stale dialogue from being silently attached to the current scene.
- Lip-sync polling is bound to the immutable scene ID as well as project/episode identity, preventing a long-running provider result from being written into a different scene slot after state changes.
- A scene-dialogue mutation check stops a synchronization request if the words/voice bindings change while approved audio is being prepared.
- Provider submission recovery now uses a SHA-256 scene+audio request digest where supported, reducing the chance of a stale/ambiguous provider generation being recovered for another request.
- The Studio explicitly shows “Dialogue sync must be rebuilt” for unsafe legacy recovered assets instead of displaying a false READY state.
- v1.9.76 duplicate-media detection, atomic synchronized final assembly, no-repeat final coverage, and account final-video persistence are retained.

## v1.9.81 approved-audio review and resilient scene media
- Unsynchronized speaking previews stay clickable and use approved CineTale dialogue while raw provider/source audio stays muted.
- Broken saved primary/sync media can fall back to another saved coverage clip for the same scene.
- Unavailable media is surfaced as needing repair instead of being presented as healthy.
- Speaking scenes still require validated lip-sync before final assembly.

