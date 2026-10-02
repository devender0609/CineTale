# CineTale v1.9.63 QA Report

## Fix
Final Sequence Preview no longer builds its queue only from `scene.videoUrl`. It now accepts the canonical validated synchronized asset returned by `scenePrimaryVideoUrl()`, so previously synchronized scenes remain in Preview even if their raw source URL is absent, replaced, or no longer authoritative.

Each scene is re-resolved from live project state immediately before playback. If a scene has no playable final asset after any sync attempt, Preview skips that scene instead of aborting the rest of the sequence.

## Regression target
- Scene 2 synchronized asset + Scene 5 synchronized asset must both appear in Preview sequence.
- A valid `lipSyncVideoUrl` is sufficient for Preview inclusion.
- Preview does not regress to the raw Google/Veo source when a validated synchronized asset exists.
