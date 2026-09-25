# CineTale v1.9.79 — Media Controls Interactivity Release Gate

## Release-blocking defect reproduced
v1.9.78 rendered native `<video controls>` for unsynchronized speaking-source previews while CSS still set `pointer-events:none` on the same `video[data-sync-gated="1"]` elements. The controls therefore looked present but could not receive mouse/pointer interaction. This directly matches the user report that every scene video appeared non-clickable.

## Fix
- Sync-gated source previews remain native, visible, and muted.
- Native controls remain pointer-interactive (`pointer-events:auto`).
- Provider/source audio remains hard-muted while dialogue sync is untrusted, including a volume-change guard that immediately re-mutes the preview.
- Validated synchronized clips continue to use their normal audible native controls.
- No scene-video code removes the `controls` attribute.
- Current runtime/package/cache-busting version advanced to 1.9.79 so browsers do not retain the broken v1.9.78 CSS.

## New regression coverage
`scripts-v1979-media-control-interactivity.mjs` verifies the complete contract rather than checking markup alone:
1. sync-gated source markup exposes native controls;
2. CSS keeps those controls pointer-interactive;
3. no competing sync-gated CSS rule disables pointer events;
4. the sync-gated preview is hard-muted by JS;
5. JS does not pause the preview merely because it is gated or remove its native controls.

A carry-forward regression that previously expected `pointer-events:none` was updated because that old expectation was the bug.

## Full verification on working tree
- 44 / 44 CineTale regression, smoke, deep-QA, audio, lip-sync, final-assembly, persistence, player-lifecycle, media-integrity and scene-isolation scripts: PASS
- 68 / 68 JavaScript/MJS syntax checks: PASS
- Deep QA: PASS (182 static IDs, 463 DOM references, 19 API routes, 3 local assets, 142 files checked)
- Search audit: no remaining scene-video `pointer-events:none` rule and no code path removing video controls.

## Important limitation
This environment's Chromium headless process does not complete reliably, so I am not claiming a live Firefox/Vercel mouse-click session was executed here. The exact code contradiction that blocked pointer input has been removed and is now protected by explicit regression coverage. Live provider/browser behavior still needs deployment confirmation.
