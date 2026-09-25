# CineTale v1.9.73 QA Report

## Release focus
This release addresses the production issues observed in Firefox around scene-player visibility, final-render UI flicker, final-video discoverability, and confusing multi-step final assembly controls.

## Root-cause findings
1. Final production exposed three separate user steps (Prepare final, Render full video, Create final video automatically) even though the product goal is a one-click final-production flow.
2. The final output player could be hidden or unavailable while project metadata still said a final video had been rendered, creating a misleading state.
3. Final-video restoration could be started repeatedly by successive UI renders before the first IndexedDB restore completed.
4. Studio could be fully remounted while a browser-side MediaRecorder final render was active. In Firefox this can blank or reload scene video elements and looks like flicker.
5. Background scene-audio/lip-sync warmups were not explicitly suspended during final capture.
6. Ready video elements used metadata-only preload; scenes without a durable poster could remain black until interaction even when the clip itself was valid.
7. Final-scene preparation failed the entire render on any individual coverage source error and did not clearly distinguish a missing authoritative synchronized speaking clip from an optional coverage failure.
8. Final render progress changed shot-level wording during capture, causing unnecessary repaint/churn and making the UI appear unstable.
9. Local final rendering is real-time browser capture, so a ~2:30 target episode can take roughly the target runtime plus preparation. The UI did not make that sufficiently clear.

## v1.9.73 changes
- Replaced the normal-user final workflow with one primary **Create final video** action.
- Kept Prepare / Render / Manifest elements only as hidden compatibility hooks; they are no longer presented as normal user steps.
- Added a permanent **Final Video** output area directly below the production action so users always know where the finished file will appear.
- Added clear states for not-created, rendering, restoring, verified-ready, and browser-local-final-file-unavailable.
- Added final-render project locking so Studio scene cards are not remounted during browser capture.
- Suspended background audio and lip-sync warmups while final capture is active.
- Added restore de-duplication for the browser-persisted final video.
- Changed ready scene videos to preload usable media and seek to a first decodable frame when paused so Firefox does not leave valid clips looking like empty black boxes.
- Added retry-based media preflight before final rendering.
- Optional failed cinematic coverage can be skipped; an unavailable authoritative synchronized speaking clip fails closed with a scene-specific error instead of silently producing an incorrect final video.
- Stabilized render progress to scene-level wording and throttled repeat DOM updates.
- Final result is still verified for a non-zero playable duration before being called ready.
- Existing paid/generated scene assets remain reusable; final assembly itself is local and does not intentionally submit new Veo or Sync Labs jobs when all selected scenes are already production-ready.

## Automated validation
- `npm run check`: PASS
- All `scripts-*.mjs`: **38 / 38 PASS**
- Deep QA: **182 static IDs, 462 DOM references, 19 API routes, 3 local assets, 129 files checked**
- Full JS/MJS syntax sweep: **62 / 62 PASS**
- Lip-sync regression: PASS
- Sync Labs adoption / resume / status resilience: PASS
- Firefox player lifecycle regression: PASS
- Scene approved-audio regression: PASS
- Voice-mix regression: PASS
- Video MIME / Range regression: PASS
- Preview sequence regression: PASS
- Existing saved Sync recovery regression: PASS
- Final-render synchronization gate regression: PASS
- Final-video playback verification regression: PASS
- Final-render progress stability regression: PASS
- New v1.9.73 one-click final UX / render-stability regression: PASS

## Release limitations / live verification boundary
No live paid Veo, ElevenLabs, or Sync Labs generation was intentionally submitted during this package QA, so no provider credits were consumed by this validation. The container's installed Chromium process did not terminate reliably in headless mode because of the execution environment, so deployed Firefox/Vercel behavior cannot truthfully be claimed as browser-verified here. The strongest available static, route, regression, syntax, and package checks were run. Production should be validated with the existing READY clips first; no scene regeneration should be necessary for the first v1.9.73 test.
