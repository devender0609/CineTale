# CineTale v1.12.4 QA Report

Release: **Professional Studio Workspace Redesign**

## Scope
- Stage-gated Studio: story review is the only main workspace before approval.
- Approved story collapses to a compact status row.
- Simplified professional scene workspace with one scene expanded at a time in Guided/Auto.
- Scene-level storyboard actions are separated from technical shot controls.
- Advanced shot grid/quality/framing remains available on demand and remains fully available in Director mode.
- World/continuity intelligence remains in the background and is available through compact detail actions.
- Final production area is simplified; the empty black final player is hidden until a real final video exists.
- Existing paid-media recovery, single-flight generation/sync, identity continuity, cultural safeguards, and final assembly logic preserved.

## Validation
- Dedicated v1.12.4 professional Studio regression: **12/12 passed**.
- Full script regression/runtime/QA set: **138/138 passed**.
- JavaScript/MJS syntax checks: **162/162 passed**.
- `npm run check`: passed.
- `npm run smoke`: passed.
- `npm run qa:deep`: passed.
- Deep QA before packaging: **206 static IDs, 520 DOM references, 19 API routes, 3 local assets, 331 files checked**.
- Exact extracted ZIP: **138/138 scripts**, **162/162 syntax checks**, `npm run check`, smoke, and deep QA all passed.
- Exact extracted ZIP deep QA: **206 static IDs, 520 DOM references, 19 API routes, 3 local assets, 332 files checked**.

## Provider note
No intentional paid Veo or lip-sync generation was submitted for this UI release. The smoke suite exercised failure/fallback paths and logged expected simulated/quota-path provider errors; these did not fail the test suite.

## Release gate
The exact packaged ZIP must be extracted and rerun through the same validation before delivery.
