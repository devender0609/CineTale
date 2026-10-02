# CineTale v1.9.78 QA Report

## Release focus
Single-scene video regeneration isolation and truthful source-video visibility while dialogue synchronization is pending/rebuilding.

## Fixes
- Regenerating one scene no longer forces a full Studio remount at submission time.
- Other scene video DOM elements remain mounted while the selected scene's provider job runs.
- Completion/error refreshes are deferred if another scene video is actively playing.
- Speaking source clips whose dialogue sync is pending/rebuilding remain visibly playable as **muted source-video previews** instead of looking deleted.
- Sync-gated source clips keep native controls but cannot be unmuted, preventing provider guide speech from being mistaken for approved dialogue.
- Added a dedicated v1.9.78 regression for cross-scene isolation and sync-gated visibility.

## Validation
- 43/43 `scripts-*.mjs` QA/regression scripts passed.
- 67/67 JavaScript/MJS files passed `node --check` syntax validation.
- Existing v1.9.77 scene-audio provenance, duplicate-media, final assembly, player lifecycle, persistence, smoke and deep-QA regressions remain passing.

## Important limitation
This environment cannot reproduce the exact deployed Firefox + Vercel + live Veo/ElevenLabs/Sync Labs interaction. The code/state/package paths are verified; live-provider behavior still requires deployment confirmation.
