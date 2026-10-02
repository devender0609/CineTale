# CineTale v1.9.42 QA Report

Release focus: prevent a failed FAL lip-sync result from replacing a preserved working scene video after rerender.

## Root cause fixed

In v1.9.41, the live error handler could restore the original source clip after a synchronized asset failed to load, but `sceneHasCurrentLipSync()` did not consider `lipSyncStatus=error` or `lipSyncPlaybackFailedAt`. A later Studio rerender therefore selected the same failed synchronized URL again, producing a blank scene card even though `scene.videoUrl` was still preserved.

## Changes

- Failed synchronized assets are explicitly excluded from `sceneHasCurrentLipSync()`.
- `scenePrimaryVideoUrl()` therefore falls back to the original preserved source video after a playback failure.
- The existing source `videoUrl` is never cleared by lip-sync fallback logic.
- Repeated automatic paid FAL retries are suppressed for the same unchanged source/dialogue/voice signature after a verified playback failure.
- Any source video, dialogue, or voice change produces a new signature and permits a fresh synchronization attempt.
- Browser cache-busting advanced to v1.9.42.

## Verification

The release was checked with package validation, smoke testing, deep QA, dedicated scene-audio, voice-mix, lip-sync/fallback regression, voice-continuity regression, video/MIME regression, JavaScript syntax checks, and ZIP integrity checks. Live FAL generation still requires deployment credentials and cannot be truthfully claimed as executed in the local QA environment.
