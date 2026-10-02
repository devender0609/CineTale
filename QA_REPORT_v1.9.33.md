# CineTale v1.9.33 QA Report

## Scope
This build is narrowly scoped to the live Studio scene-video flicker reported in v1.9.32. No intentional changes were made to project navigation, auth, cloud schema, story generation, image generation, voice, consent, video-generation routing, MIME handling, or final assembly.

## Fix
`renderStudio()` previously rebuilt `#sceneList` with `innerHTML` on every `renderAll()` call. Cloud/account/media state updates can call `renderAll()` even when the scene itself has not changed. Replacing the scene DOM recreates the `<video>` element, causing Firefox to reload the media and visibly flicker.

v1.9.33 now:
- computes the complete scene markup first;
- keeps the existing scene DOM mounted when the project/episode and rendered scene markup are unchanged;
- recreates scene DOM only for a meaningful scene UI change;
- preserves playback time, paused/playing state, mute, volume, and playback rate when a meaningful scene update requires replacement of the scene DOM and the video URL is unchanged;
- does not call `video.load()` during ordinary Studio rerenders.

## Validation
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- video MIME/range regression — PASS
- all JS/MJS syntax checks — PASS (25 files)
- source regression: no unconditional `#sceneList.innerHTML = scenes.map(...)` remains — PASS
- Chromium DOM-stability regression using the same preservation algorithm:
  - unchanged rerender preserves the exact same `<video>` DOM node — PASS
  - meaningful scene markup change still updates the scene DOM — PASS
- ZIP integrity — PASS

## Live-provider/browser boundary
The production Veo asset itself and the user's exact Firefox session cannot be executed from this environment. The code path that was recreating the player on unchanged rerenders is fixed and regression-tested. The existing v1.9.32 video MIME/range and stale-operation fixes remain unchanged.
