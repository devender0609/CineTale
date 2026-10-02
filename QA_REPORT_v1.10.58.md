# CineTale v1.10.58 — Terminal READY Adoption & Credit-Safe Recovery QA

## Live root cause demonstrated
The deployed v1.10.57 status endpoint was observed in the browser returning a completed result for the stuck Shot 1:
- `status: ready`
- `done: true`
- `terminal: true`
- a valid `/api/video-file?uri=...files/...:download?alt=media` URL

The provider generation and server-side asset extraction therefore succeeded. The remaining defect was in the client recovery/adoption lifecycle: a persisted coverage operation could continue presenting GENERATING while CineTale attempted durable adoption, and the provider-completed result was not represented as a separate state from an actively rendering job.

## v1.10.58 fix
- Terminal READY is now authoritative before durable persistence starts.
- Primary and coverage jobs atomically claim the completed provider result and clear the active operation/queued state before persistence.
- A provider-completed result records `videoProviderCompletedAt` and a recovery state so it can never be mistaken for a missing video generation.
- Persistence success transitions the result to durable READY.
- Persistence failure becomes `SAVE NEEDED` / restore-existing-result behavior rather than returning to GENERATING or silently submitting another paid video job.
- Manual primary recovery attempts to restore the already-finished provider result before any generation submission.
- Coverage auto/manual recovery does the same and explicitly stops instead of generating a replacement when a provider-completed result cannot yet be restored.
- Completed unsaved provider results are excluded from `needsVideo` counts, protecting automatic final production from duplicate billable generation.
- Project-open recovery, background polling, automatic production, primary scene generation, and coverage generation use the same completed-result semantics.
- Existing media, identity, multilingual, voice, lip-sync, scene preview, final assembly, navigation, persistence, and no-flicker protections remain in place.

## Validation
- 121/121 regression/runtime/QA scripts: PASS
- 148/148 JS/MJS syntax checks: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- New `scripts-v11058-ready-adoption-lifecycle-regression.mjs`: PASS
- Deep QA inventory: 188 static IDs, 475 DOM references, 19 API routes, 3 local assets, 302 files checked

## Exact ZIP validation
The final ZIP is extracted into a clean directory and the same full regression set, syntax checks, check, smoke, deep QA, and v1.10.58 lifecycle regression are rerun against the extracted package before delivery.

## Live-provider limitation
No additional paid Veo generation is intentionally submitted for packaging QA. The v1.10.58 fix is based on the actual observed live v1.10.57 terminal READY response. After deployment, the correct acceptance test is to reopen the existing stuck project first: CineTale should recover that already-completed result without submitting another video-generation job.
