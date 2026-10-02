# CineTale v1.10.28 QA Report

## Release focus
Shot inventory, truthful legacy-media status, and missing-work credit safety.

## Production fixes
- Replaced blanket "existing valid media is preserved" copy with counts derived from the actual planned-shot inventory.
- Story shot cards now distinguish READY, DIALOGUE, RENDERING, RECREATE, and PLANNED states.
- Expired/non-durable legacy provider references are labeled RECREATE rather than implied to be preserved.
- Final-production confirmation reports planned shots, preserved shots, missing video shots, dialogue-only work, and expired legacy shots.
- Coverage generation reuses durable saved shot media. If a durable saved shot cannot be hydrated, CineTale fails closed instead of automatically spending credits to regenerate it.
- Existing synchronized audio/lip-sync logic and deterministic timeline ordering remain unchanged.

## Validation
- JavaScript syntax: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: 89/89 PASS
- New `scripts-v1128-shot-inventory-credit-safety-regression.mjs`: PASS
- Existing migration, navigation, media-recovery, null-safe shot-plan and synchronized-audio regressions: PASS

## Live-provider limitation
No paid Veo, ElevenLabs, or Sync Labs generation was executed from this QA environment. Production provider behavior remains subject to live acceptance testing.
