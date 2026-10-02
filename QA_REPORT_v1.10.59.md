# CineTale v1.10.59 — Canonical Coverage Operation Recovery QA

## Release focus
This release fixes the live v1.10.58 failure where `/api/video-status` returned a terminal READY result with a valid `videoUrl`, but the Studio remained in `GENERATING`.

## Root cause demonstrated from the actual exported workspace
The current Hindi test project (`कैलाश का बुझा दीप`, episode `बुझा हुआ पाषाण दीप`) contains four persisted `coverageClips` rows for Scene 2 / Shot 1 (`scene-2-shot-1`):

- one historical failed row with `VIDEO_ASSET_MISSING` and no operation;
- three additional rows for the same shot, each carrying a different Veo operation ID.

The recovery lifecycle resolved coverage state using a generic first-match-by-shot lookup in places where it needed the exact persisted operation. The first duplicate row could therefore be the old failed/no-operation row, causing a terminal READY result for another duplicate operation to be rejected before adoption. The Studio status selector could simultaneously select a different duplicate active row, leaving the shot visibly `GENERATING`. This was a split-brain duplicate-record failure, not a provider-generation failure.

## Fix
- Added exact `shotId + operation` lookup for persisted coverage recovery.
- Unknown operation IDs no longer fall through to a different duplicate record for the same shot.
- Terminal READY adoption resolves and claims the exact operation that produced the result.
- Successful READY adoption collapses all persisted rows for that shot to one canonical `coverageClips` record.
- Other historical/duplicate active operation IDs are retained as `videoSupersededOperations` evidence rather than remaining active rows that can drive the UI.
- The canonical record clears `operation`/`queuedAt` before durable persistence, stopping terminal polling from continuing to present as generation.
- Existing duplicate-safe submission, no-automatic-billable-retry, durable-media, identity, multilingual, voice, lip-sync, shot-planning, project-reopen, scene-isolation and final-assembly protections remain in place.
- Application/package/cache-bust/production-logic revisions are advanced consistently to v1.10.59.

## Actual workspace audit
The uploaded 2026-10-02 workspace was parsed directly. The duplicate group reproduced exactly:

`scene-2-shot-1` -> 4 records -> operations: `null`, `.../9wz3vr0h3lhn`, `.../sn27jk09x7g9`, `.../j76hmad8fmx8`.

No new paid video job was required to demonstrate this saved-state defect.

## New regression
`scripts-v11059-duplicate-coverage-operation-recovery-regression.mjs` creates the same saved-state class (old failed row plus multiple active operations for one shot) and verifies:

1. exact operation resolution;
2. no fall-through to a sibling duplicate;
3. terminal READY result is claimable;
4. duplicate rows collapse to one canonical shot record;
5. the adopted `videoUrl` is preserved;
6. the active operation is cleared;
7. persistence enters the saving/recovery lifecycle;
8. other duplicate operation IDs are marked superseded rather than left active.

## Full source-tree validation
- 122/122 non-core QA/regression/runtime scripts: PASS
- 149/149 JavaScript/MJS syntax checks: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Deep QA inventory: 188 static IDs, 475 DOM references, 19 API routes, 3 local assets, 304 files checked.

Smoke output also exercised existing provider fallback/error handling. The QA environment encountered known simulated/available-provider conditions for Gemini quota/delivery mode and an ElevenLabs fallback; those did not fail the smoke suite.

## Live-provider limitation
No fresh paid Veo generation was intentionally submitted for packaging QA. The browser evidence already demonstrated that the existing Veo operation reached terminal READY with a valid `videoUrl`; this release fixes the persisted duplicate-record adoption path that prevented that completed result from becoming canonical Studio state.

## Release gate
The release is eligible for packaging only after the exact final ZIP is extracted into a clean directory and the same complete validation set is rerun against those exact packaged bytes.
