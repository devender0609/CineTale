# CineTale v1.10.21 QA Report

## Release purpose
Final-production continuation fix built on the working v1.10.20 episode-completion flow and the production-validated v1.10.19 synchronized-audio baseline.

This release targets one precise live failure: final production reached 4/5 READY with Scene 5 actively synchronizing, but the orchestration treated the ordinary provider wait as a failure and required repeated **Resume final video** clicks.

## Main changes

- Added `ensureAutoFinalDialogueSync()` as the automatic final-production dialogue wait/resume controller.
- Active dialogue states (`preparing`, `waiting`, `processing`, `PENDING`, `PROCESSING`, `WAITING_FOR_SLOT`, or an existing operation ID) remain part of the same running final-production job.
- Final production keeps polling/resuming the **same existing paid synchronization job** until it becomes validated instead of throwing after one incomplete check.
- The user-facing stage becomes **Finishing scene X of Y · synchronizing dialogue…** during normal provider processing.
- When the scene becomes READY, CineTale continues automatically into the 5/5 production-readiness gate and final assembly/rendering.
- **Resume final video** remains reserved for a genuine interruption, explicit pause, or recoverable error; ordinary provider processing is no longer presented as a manual-resume state.
- Active jobs remain persisted so refresh/reopen can continue through the existing `maybeResumeAutoFinal()` recovery path.
- Protected READY scenes and the v1.10.19 authoritative synchronized-audio path are unchanged.

## Regression coverage added

`scripts-v1121-auto-final-sync-continuation-regression.mjs`

Covers:
- v1.10.21 version/cache binding;
- automatic dialogue-sync continuation helper is present and wired into final production;
- ordinary provider processing remains `running`;
- active synchronization is logged as `auto-final-sync-wait` rather than converted to a user Resume error;
- previous one-shot `dialogue synchronization did not finish ... resume final production` failure path is removed;
- definitive provider errors remain fail-closed and can still surface as true attention states.

## Source-tree verification

- All JS/MJS syntax checks: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: **81/81 PASS**
- Deep QA inventory before packaging: **188 static IDs, 464 DOM references, 19 API routes, 3 local assets**

## Production-validation boundary

The deployed v1.10.20 project already demonstrated that Scenes 1–4 can be preserved/modernized to READY while Scene 5 reaches the synchronization stage. v1.10.21 changes only the orchestration around that active synchronization wait.

No paid live Veo/Sync Labs generation was executed from this QA environment. Therefore this release remains an RC until the deployed project demonstrates **4/5 + Scene 5 syncing → 5/5 READY → automatic final episode render** without another manual Resume click.

## Exact packaged-ZIP verification

- All JS/MJS syntax checks: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: **81/81 PASS**
- Packaged deep QA inventory: **188 static IDs, 464 DOM references, 19 API routes, 3 local assets, 220 files checked**
