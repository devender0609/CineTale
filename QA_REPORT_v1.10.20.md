# CineTale v1.10.20 QA Report

## Release purpose
Episode-completion milestone built on the production-validated v1.10.19 synchronized-audio baseline.

This release intentionally does **not** redesign the working Scene 1/2 synchronized-audio path. It changes how CineTale identifies and replaces legacy speaking-scene source clips while preserving already validated synchronized scenes.

## Main changes

- Added `sceneSourceMatchesCurrentProduction()` so a source counts as current only when it is durably owned and, for speaking scenes, has the exact current video production contract.
- Added legacy-source detection (`sceneNeedsModernSource`) and a user-facing **Update clip** state for older speaking clips that predate the strict shot/character production contract.
- Automatic final production treats legacy/mismatched speaking sources as missing work and rebuilds them instead of hydrating/reusing them as if current.
- Protected current synchronized scenes are excluded from source regeneration.
- Replacement video jobs stage their new shot metadata/production contract separately while rendering. The old source is not relabeled with the new contract.
- The staged contract is committed only after the replacement video is downloaded, durably persisted, and adopted.
- Pending/recovered provider jobs preserve that staged contract across resume/reopen.
- The Studio workflow can advance from partially completed production to **Finish episode** / final-name equivalent, which invokes the existing automatic completion and final-assembly pipeline while preserving finished scenes.

## Regression coverage added

`scripts-v1120-episode-completion-regression.mjs`

Covers:
- v1.10.20 version/cache binding;
- legacy source detection and **Update clip** state;
- 2 current synchronized scenes protected while 3 legacy scenes are selected for modernization;
- automatic final-production source selection;
- prevention of premature production-contract reassignment to the old source during a replacement render;
- staged production contract committed transactionally with the replacement source;
- polling does not return the still-visible legacy source while its replacement job is active;
- workflow handoff to automatic episode completion.

## Source-tree verification

- All JS/MJS syntax checks: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: **80/80 PASS**
- Deep QA inventory: **188 static IDs, 464 DOM references, 19 API routes, 3 local assets, 217 files checked**

## Production-validation boundary

The v1.10.19 production trace established that Scene 1 and Scene 2 can reach validated, durable, clickable synchronized playback with authoritative provider audio. v1.10.20 preserves that architecture and adds legacy-scene modernization/final-production orchestration around it.

No paid live Veo/Sync Labs generation was executed from this QA environment. Therefore the release remains an RC until the deployed project demonstrates that Scenes 3–5 modernize successfully, all selected scenes reach production-ready state, and the full final episode renders and survives reopen/refresh.

## Exact packaged-ZIP verification

The final ZIP was extracted into a clean directory and the same release gates were rerun against the extracted bytes:

- All JS/MJS syntax checks: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: **80/80 PASS**
- Packaged deep QA inventory: **188 static IDs, 464 DOM references, 19 API routes, 3 local assets, 218 files checked**
- ZIP SHA-256: `e941f7bba87892388c9239c247dc4e9f1672647e67f8a8418827a5f1b9517b8e`
