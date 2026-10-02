# CineTale v1.9.93 QA Report — Finished Player Handoff

## Scope
This release addresses the live v1.9.92 failure where a speaking scene could remain silent and behave like the unfinished visual preview even after dialogue synchronization had completed.

## Root cause found
v1.9.92 correctly distinguished an unsynchronized speaking source from a validated synchronized clip, but the mounted Studio `<video>` element was intentionally preserved across rerenders. When the scene transitioned from preview to validated sync, the old DOM node was kept. That node had permanent sync-gate event listeners, no native `controls`, and logic that forced `muted=true`. Updating only its `src`/`muted` property could therefore leave the completed synchronized asset on the old preview player and re-mute it.

## Fix
- Added a semantic media-mode transition check during full Studio reconciliation.
- When a scene changes between sync-gated preview and finished/native-control playback, CineTale replaces only that scene's `<video>` element.
- Added the same scene-local replacement to `renderStudioAfterSceneMediaUpdate`, the path used when `Finish clip` completes.
- Unrelated scene players remain mounted, preserving the prior anti-flicker/isolation work.
- Unsynchronized speaking source remains a clearly unfinished muted visual preview; CineTale does not fake finished dialogue with a detached audio overlay.
- Validated synchronized media mounts on a clean native `<video controls>` element with no inherited preview mute listener.

## Regression coverage added
`scripts-v1993-finished-player-handoff-regression.mjs` checks:
- unfinished speaking media remains sync-gated and muted;
- finished media uses native controls;
- full Studio reconciliation replaces the player when semantic media mode changes;
- scene-local media completion replaces the gated preview when `Finish clip` succeeds;
- the fix does not merely flip `muted` on the old gated node.

## Verification performed on source tree
- `node --check app.js`: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- v1.9.91 regression: PASS
- v1.9.92 regression: PASS
- v1.9.93 regression: PASS
- all `scripts-*.mjs`: 57/57 PASS

## Browser verification
A real installed Chromium binary was invoked against the local app/e2e harness. In this container the headless Chromium process did not exit reliably and timed out with environment/DBus/zygote errors, so browser-level playback was **not** claimed as verified from this environment.

## Live-provider verification
No paid/live Veo, ElevenLabs, or lip-sync generation was deliberately triggered. Therefore this release does **not** claim live-provider end-to-end acceptance. The required deployed acceptance test remains one speaking scene only:
`Finish clip -> one audible synchronized player -> refresh -> same clip -> reopen project -> same clip`, while confirming other scenes are unchanged.

## Release rule
The packaged ZIP is re-extracted into a clean directory and the syntax/regression checks are rerun against that exact packaged copy before delivery.
