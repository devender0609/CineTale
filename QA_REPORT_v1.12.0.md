# CineTale v1.12.0 QA Report

## Release
CineTale v1.12.0 — Persistent CineTale Worlds + Continuity Guardian + Smart Production Plan.

## Product changes
- Added a persistent CineTale World identity to every project (`worldId`, `worldName`, timestamps) while preserving the existing World Bible/global cultural context.
- Added a Studio World command center with three live panels: World Bible, Continuity Guardian, and Smart Production Plan.
- Continuity Guardian reuses the existing production-logic audit and surfaces structural identity/shot problems, episode continuity warnings, and cultural uncertainty notes before paid production.
- Smart Production Plan aggregates the actual shot/media inventory and shows ready/reusable shots, missing video, dialogue finishing, recovery-first items, and planned new-motion/dialogue seconds.
- Reuse-first messaging is explicit: durable media is reused/recovered before another paid generation is submitted.
- No invented dollar estimate is shown; the planner reports actual planned generation seconds and the selected Economy/Balanced/Cinematic profile.
- Existing v1.11.x cultural intelligence, multilingual behavior, cost guardian, media recovery, single-flight dialogue sync, player lifecycle, and final assembly safeguards are retained.

## Validation
- 135/135 regression/runtime/QA scripts passed.
- Dedicated v1.12.0 World + Continuity + Production Plan regression: 12/12 passed.
- JavaScript/MJS syntax validation passed for all checked files.
- `npm run check` passed.
- `npm run smoke` passed.
- `npm run qa:deep` passed.
- Deep QA: 206 static IDs, 504 DOM references, 19 API routes, 3 local assets, 325 files checked.

## Provider-cost discipline
No intentional new paid Veo or lip-sync generation was submitted to validate this product-layer release. Provider error/fallback messages printed by automated QA exercise failure-handling paths; they are not evidence of a newly purchased production render.
