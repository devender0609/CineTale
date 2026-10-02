# CineTale v1.9.85 QA Report

## Release purpose
Fix the v1.9.84 regression where Studio scene videos could appear as solid black rectangles with no visible player controls.

## Root cause
v1.9.84 added a custom poster DOM layer above every scene video to mask loading/recovery flashes. The layer had a higher z-index than the native `<video>` element and was hidden only after `loadeddata` / `canplay`. With `preload="metadata"`, browsers are allowed to load metadata without decoding a first frame until the user starts playback. Therefore the custom layer could remain visually above the video indefinitely, hiding the native video controls even though the real `<video>` was mounted underneath it. When a scene had no hydrated storyboard art, the overlay itself was a solid black rectangle, matching the reported production screenshot.

## v1.9.85 correction
- Removed the custom `scene-video-poster` DOM overlay from scene video markup.
- Removed the empty black poster overlay fallback.
- Uses the browser-native `<video poster="...">` attribute when storyboard art is available.
- The native `<video controls>` element is visible from first paint and remains the top visible media surface.
- Preserved `preload="metadata"` to avoid downloading every full remote video at Studio open.
- Preserved the stable-player / no-remount logic from v1.9.84.
- Preserved scene-local media recovery, lip-sync provenance gates, no-surprise billing, timed-shot planning, and final-assembly safeguards.

## Automated validation
All project regression/smoke/deep-QA scripts were executed against the working source:
- 49 / 49 scripts passed.
- `scripts-v1985-native-player-visibility-regression.mjs` specifically verifies that no DOM poster overlay can cover the player, native controls are rendered directly, native poster support is used, and the video surface remains visible during metadata loading.
- JavaScript/MJS syntax validation: 73 / 73 files passed.

## Browser-harness limitation
A headless Chromium browser was launched and remote debugging was reachable, but this execution environment blocks both localhost and `file://` page navigation with an organization policy. Therefore a truthful live browser interaction test could not be completed here for v1.9.85. This is explicitly not counted as a pass. The code-level cause of the black-player regression is directly identified and removed, and package-level tests are rerun after ZIP extraction.

## Release gate
This version should not be considered verified in the user's exact deployed Firefox/Vercel/Supabase/provider environment until the existing project is opened after deployment and the existing scene players are visibly present/clickable. No regeneration should be needed merely to test visibility.
