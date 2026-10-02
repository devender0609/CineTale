# CineTale v1.10.65 QA Report

## Release focus
Primary-video provenance recovery and dialogue-sync unblock for modern multi-shot speaking clips.

## Live workspace root cause reproduced
The supplied v1.10.64 workspace shows Scene 2 / Shot 2 selected, a durable modern `source-primary` video saved in browser/cloud storage, but no `videoPrimaryShotId` / `videoProductionContract`. The scene therefore carried `lipSyncErrorCode: legacy_video_identity_unverified` and could never enter the actual dialogue-sync provider path. This was traced to the terminal READY polling lifecycle: the code claimed a provider-completed primary result (clearing `videoOperation`) and then incorrectly required the cleared operation to still be present before durable commit, so the pending shot identity/production contract could be lost.

## v1.10.65 fixes
- Terminal READY primary-video polling no longer aborts after claiming the completed provider result.
- Pending primary-shot metadata is applied at claim time and retained through durable commit.
- Durable commit verifies the exact claimed provider URL rather than relying on an already-cleared operation field.
- Existing modern `source-primary` assets that were affected by the v1.10.64 bug are self-healed on project load when:
  - the source is durably owned,
  - a provider completion timestamp exists,
  - the saved media path/key proves it came from the modern `source-primary` pipeline,
  - and there is no pre-existing production contract to overwrite.
- Recovery restores the deterministic primary shot ID, speaker, spoken line, timing metadata, speech-guide flag and exact production contract.
- Only the specific `legacy_video_identity_unverified` error is cleared after provenance is safely reconstructed.
- Existing contracts are fail-closed and are never overwritten by this migration.
- The saved source video is reused; no replacement Veo job is required for the affected Shot 2.
- All v1.10.59-v1.10.64 protections remain, including duplicate-operation reconciliation, player MIME shielding, transient-provider handling, selected-shot lifecycle, and single-flight dialogue-sync state.

## Exact supplied-workspace trigger
The supplied project matches the migration gate:
- primary speaking shot resolves deterministically to `scene-2-shot-2` / बाल कार्तिकेय,
- durable source path contains `source-primary`,
- provider completion timestamp is present,
- production contract is absent,
- legacy identity error is present.

## Validation
Source tree:
- 131/131 regression/runtime/QA scripts passed.
- 155/155 JavaScript/MJS syntax checks passed.
- `npm run check` passed.
- smoke suite passed.
- deep QA passed: 188 static IDs, 476 DOM references, 19 API routes, 3 local assets, 317 files checked.
- v1.10.65 primary-video provenance recovery regression: 10/10 passed.

## Live-provider limitation
No new paid Veo or lip-sync job was submitted for packaging QA. The existing affected source is expected to self-heal its provenance on open; the next user-initiated `Retry Shot 2 dialogue` should use that saved video and enter the real dialogue-sync provider path without regenerating the video.
