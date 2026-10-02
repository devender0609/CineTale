# CineTale v1.10.19 QA Report

## Scope
v1.10.19 removes browser MediaRecorder MP4 re-recording from the authoritative speaking-clip release path. A completed Sync Labs result may become authoritative only when the current scene/shot/voice/audio provenance matches the exact submitted request, the returned provider MP4 is playable, and the synchronized asset is durably persisted.

## Production issue addressed
The v1.10.18 production trace showed both Scene 1 and Scene 2 reaching Sync Labs COMPLETED state while CineTale kept them unvalidated, muted, gated, and non-clickable because Chrome could not create an H.264/AAC MP4 through MediaRecorder. This browser capability is no longer a release requirement.

## v1.10.19 behavior
- Completed Sync Labs output generated from the exact approved audio request is persisted directly as the synchronized scene asset.
- Exact scene/shot/voice/audio provenance remains required.
- `lipSyncProviderAudioAuthoritative` records provider-audio adoption.
- Existing completed current-signature provider assets can be adopted without resubmitting a paid generation.
- New completed generations are persisted before `lipSyncValidated=true`.
- Speaking clips remain fail-closed if provenance, playability, or durable persistence fails.
- The old browser MediaRecorder finalizer remains in source only as legacy/non-authoritative code; the production provider-completion and existing-completed-asset paths do not call it.

## Verification performed on source tree
- All JS/MJS syntax checks: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- 79/79 non-core regression/runtime scripts: PASS
- v1.10.19 provider-audio authoritative regression: PASS
- Deep QA: 188 static IDs, 464 DOM refs, 19 API routes, 3 local assets, 215 files checked before this report was added.

## Important live-provider limitation
The production Sync Labs and ElevenLabs credentials were not executed from this QA environment. The release remains an RC until a deployed speaking scene mounts the persisted synchronized provider MP4 as authoritative, is clickable, plays audibly with the approved voice, and survives refresh/reopen.
