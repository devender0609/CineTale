# CineTale v1.10.24 QA Report

## Release focus
Existing-project shot-plan migration and visible story-shot timeline.

This release addresses the live finding that an older project could still appear as one 8-second clip per scene even after the v1.10.23 multi-shot engine was added.

## Implemented safeguards
- Existing projects are migrated on load through `migrateProjectShotTimelines`.
- Every scene receives/persists the deterministic balanced `coveragePlan` before new final production begins.
- Existing valid primary/synchronized media is preserved and, when its persisted speaker + exact spoken line match a current planned speaking shot, its shot identity is restored rather than regenerated.
- Each scene now visibly exposes a horizontally scrollable **Story shot plan** with per-shot state: READY, DIALOGUE, RENDERING, or PLANNED.
- Longer scenes receive enough provider-length shot slots to represent the requested story duration without conceptually stretching a single short AI clip across the scene.
- Every distinct dialogue turn remains a separate planned speaking shot.
- Previously working synchronized-audio, provider-authoritative audio, retry, persistence, and final-production protections remain in place.

## Verification
- JavaScript/MJS syntax: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: 84/84 PASS
- New v1.10.24 existing-project migration regression: PASS
- 90-second balanced scene regression: at least 15 planned shots; every dialogue turn distinct; each planned shot <= provider target duration; timeline covers complete 90-second beat: PASS
- Deep QA: 188 static IDs, 464 DOM references, 19 API routes, 3 local assets, 225 files checked

## Live-provider limitation
No paid Veo, ElevenLabs, or Sync Labs production generation was executed from this environment. The release remains an RC until the deployed existing project visibly shows multiple planned shots and the subsequent missing-shot production/final assembly path succeeds in the user's production account.
