# CineTale v1.9.67 QA Report

## Production issue reproduced from user screenshots
- Scene 2 and Scene 5 had previously completed synchronized video assets, but Studio rendered them as non-clickable sync-gated source previews.
- Final Assembly reported both as SYNCING and 0 / 5 ready.
- Preview sequence was therefore disabled because no scene passed `sceneHasValidatedLipSync()`.

## Root cause
The persisted synchronized asset was being invalidated by the lip-sync signature itself. The old signature included:
1. every character voice in the whole project, even characters unrelated to the scene; and
2. the full `dialogueBindings` object, including non-semantic metadata such as `boundAt` timestamps.

A harmless project hydration/binding normalization or an unrelated character voice change could therefore make a previously paid, validated Sync Labs render fail the current-signature equality check. Once that happened, Studio intentionally removed controls from the speaking source clip, making the scene appear broken even though the synchronized asset was still saved.

## Fix
- Replaced the global project-wide signature with a scene-semantic signature.
- A speaking scene now depends only on its own source video, language, dialogue/narration, resolved audio direction, semantic speaker bindings, voices of characters actually speaking in that scene, and narrator settings only when narration exists.
- `boundAt` timestamps are excluded.
- Unrelated characters can no longer invalidate another scene's paid synchronized render.
- Added a compatibility migration for already-validated legacy synchronized assets. If the source video, spoken content, semantic bindings, and relevant historical voice settings still match, CineTale upgrades the saved signature instead of generating a new paid lip-sync job.
- Existing v1.9.66 Preview read-only/no-remount protections remain intact.

## Validation
- `npm run check` PASS
- `npm run smoke` PASS
- `npm run qa:deep` PASS
- All `scripts-*.mjs` regression scripts PASS, including v1.9.67 signature migration regression
- Full JS/MJS syntax sweep PASS
- Deep QA: 178 static IDs, 457 DOM references, 19 API routes, 3 local assets, 116 files checked before this report was added

## Live-provider limitation
No new Sync Labs generation was submitted during QA. This release is specifically designed to recover and reuse already validated synchronized assets without spending credits. Live browser/cloud persistence behavior must still be confirmed on the user's deployed project because the persisted project state exists in the user's browser/cloud workspace, not in the static test environment.
