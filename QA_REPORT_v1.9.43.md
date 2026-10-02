# CineTale v1.9.43 QA Report

## Release focus
Stable scene-player lifecycle during background lip-sync processing.

## Fixed regression
The Studio player always starts from the preserved source scene video unless a synchronized FAL asset has been positively validated in the current browser session. A lip-sync result finishing while the source clip is visibly playing is prevalidated but not swapped into the active media element mid-play. Adoption is deferred until the video is paused or ended, preventing Firefox from briefly blanking/recreating the scene player during playback.

## Safety behavior
- Original source video remains the durable fallback.
- Synced assets are preloaded/validated before adoption.
- Active playback is never source-swapped.
- Failed synchronized playback marks the sync result invalid and restores the original source.
- Refresh/reopen starts from the preserved source rather than trusting an unvalidated persisted synced URL.
- Voice continuity, clean approved-voice overlay, final assembly, video proxy/MIME handling, and provider fallbacks remain covered by regression tests.

## Live-provider limitation
Automated tests validate application logic and mocked provider lifecycle. A real FAL Sync job using the deployment's private FAL_KEY cannot be executed from this build environment, so live provider latency/output must still be checked in production without claiming it was locally verified.
