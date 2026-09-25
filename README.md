# CineTale v1.9.77 — Scene-audio provenance + safe synchronized media

This build simplifies the creator-facing final workflow and hardens Firefox/media behavior.

Normal user flow:

1. Review/approve the story and scene choices.
2. Click **Create final video**.
3. CineTale reuses ready assets and completes only missing production work.
4. Final rendering is verified before the result is shown.
5. The finished video appears in the dedicated **Final Video** area with **Download** and **Share**.

Technical Prepare, manual Render, and Manifest controls are no longer shown to normal users. Final capture locks Studio against remounts, suspends background warmups, preflights scene media with retries, and shows stable scene-level progress.

See `QA_REPORT_v1.9.73.md` for validation details and live-provider/browser limitations.

## v1.9.75 final-video persistence setup

CineTale v1.9.75 keeps the browser final-video copy and can also persist signed-in creators' final videos in private Supabase Storage. Run `SUPABASE_FINAL_VIDEO_STORAGE_SETUP.sql` once in the same Supabase project used by CineTale Auth. The bucket is private and RLS limits each signed-in user to their own UID folder.

If the bucket is not installed, final rendering still completes and the app keeps the browser-local copy, but the UI will accurately identify it as browser-only persistence.


## v1.9.76 media integrity

Final rendering now treats each validated synchronized speaking clip as an atomic picture+audio unit, does not pad it with silent coverage, detects duplicate source/synchronized media across different scenes (including content fingerprints when accessible), repairs only the later duplicate scene during one-click production, and binds background video polling to the project/episode that started the job. Existing valid synchronized assets keep the same lip-sync semantic revision.

## v1.9.77 scene-audio provenance and safe recovery

- A synchronized scene is no longer trusted merely because its saved MP4 is playable. CineTale now preserves the exact scene semantic signature and a SHA-256 fingerprint of the approved audio submitted for lip-sync.
- Legacy synchronized assets that an older build marked as “recovered” without proving dialogue compatibility are intentionally blocked from READY and rebuilt only when final production actually needs them. This prevents stale dialogue from being silently attached to the current scene.
- Lip-sync polling is bound to the immutable scene ID as well as project/episode identity, preventing a long-running provider result from being written into a different scene slot after state changes.
- A scene-dialogue mutation check stops a synchronization request if the words/voice bindings change while approved audio is being prepared.
- Provider submission recovery now uses a SHA-256 scene+audio request digest where supported, reducing the chance of a stale/ambiguous provider generation being recovered for another request.
- The Studio explicitly shows “Dialogue sync must be rebuilt” for unsafe legacy recovered assets instead of displaying a false READY state.
- v1.9.76 duplicate-media detection, atomic synchronized final assembly, no-repeat final coverage, and account final-video persistence are retained.
