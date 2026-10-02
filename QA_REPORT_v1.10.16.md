# CineTale v1.10.16 — Automatic Dialogue Finalization RC

## Scope
This release removes the normal user-facing **Complete clip** step for speaking scenes and makes dialogue synchronization/audio finalization part of the automatic scene-production lifecycle.

## Changes validated
- Owned speaking scenes that are not yet fully validated enter an automatic `finalizing` state instead of exposing `Complete clip`.
- Existing completed synchronized assets are automatically reused and finalized with the exact approved character TTS without submitting a new paid lip-sync job.
- If browser autoplay/AudioContext policy blocks background finalization, the user's normal **Play** gesture transparently resumes approved-audio finalization; there is still no separate Complete clip button.
- Fresh source-video generation continues automatically into lip-sync submission/finalization.
- Explicit character voice/performance changes invalidate stale synchronized dialogue for affected speaking shots and mark them for automatic resynchronization.
- The final synchronized speaking asset remains fail-closed: `lipSyncEmbeddedAudioVerified` and durable ownership are required before `sceneHasValidatedLipSync` can return true.
- Existing source video is preserved throughout failures/retries.

## Source-tree validation
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: **76/76 PASS**
- Deep QA inventory: **188 static IDs, 464 DOM refs, 19 API routes, 3 local assets, 209 files checked**

## New v1.10.16 regression
`scripts-v11016-automatic-dialogue-finalization-regression.mjs` verifies:
- no normal `Complete clip` label,
- automatic `Finalizing dialogue…` state,
- automatic reuse/finalization of an existing synchronized asset,
- no new provider submission from Play-triggered audio finalization,
- automatic continuation after fresh video generation,
- voice-change invalidation and automatic dialogue refresh.

## Live-provider/browser limitation
No paid live Sync Labs generation or production ElevenLabs request was executed from this QA environment. Browser autoplay/MediaRecorder behavior cannot be claimed production-verified here. The build therefore remains a release candidate until the deployed Scene 1 workflow demonstrates audible playback after automatic finalization.
