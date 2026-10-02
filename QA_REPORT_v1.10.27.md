# CineTale v1.10.28 QA Report

Release focus: null-safe migrated shot-plan rendering and recovery stability.

## Production issue reproduced from live browser
- `coverageSourceDurablyOwned()` received a null coverage entry for a planned-but-not-yet-generated shot.
- That threw `TypeError: can't access property 'videoLocalMediaKey', entry is null` and aborted Studio rendering.
- A legacy provider rescue URL also returned HTTP 502; this is treated as unavailable temporary media rather than a valid durable asset.

## Fixes
- Coverage source/sync ownership helpers now tolerate null planned-shot entries.
- Coverage runtime URL helpers now tolerate null entries.
- Planned shots without saved media render as PLANNED instead of crashing the entire scene-production UI.
- Shot timeline migration marker advanced to 1.10.28 so repaired migrated scenes are re-evaluated safely.
- No regeneration is triggered by the fix.

## Verification
- JavaScript/MJS syntax: PASS
- npm run check: PASS
- npm run smoke: PASS
- npm run qa:deep: PASS
- Non-core regression/runtime scripts: 88/88 PASS
- New v1.10.28 null-safe migrated shot-plan regression: PASS

Live provider/browser acceptance remains required after deployment. A stale provider URL returning 502 cannot be recovered if neither the browser durable copy nor account storage copy still exists; CineTale must fail closed rather than invent media.
