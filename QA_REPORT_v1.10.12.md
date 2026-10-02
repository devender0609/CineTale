# CineTale v1.10.13 QA Report

## Purpose
Live speaking-clip control-flow repair based on the v1.10.11 owner diagnostic report.

## Defects addressed
1. **Retry click durability** — scene video actions now use a stable delegated click handler on `#sceneList`, so scene-local DOM replacement cannot detach the Retry/Complete action. The click is traced as `scene-video-action-click`, then `finishSceneClip` traces `retry-action-enter` and calls synchronization with `userInitiated:true`, `allowSubmit:true`, `quiet:false`.
2. **Existing-job contract recovery** — an existing lip-sync job may resume when its stored production contract still identifies the same project, episode, scene, shot, speaking flag, speaker, speaker character ID, and exact spoken line. Descriptive metadata/schema drift no longer invalidates an otherwise exact job. Current source video provenance remains independently strict.
3. **Malformed absolute URL repair** — persisted media references such as `https://cine-tale.vercel.apphttps://cine-tale.vercel.app/...` are canonicalized back to the real absolute URL. Empty URLs remain empty.

## Validation performed
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- All JavaScript syntax checks: PASS
- 72 non-core QA/regression scripts: PASS
- `scripts-v1112-live-sync-control-regression.mjs`: PASS
- `scripts-v1112-live-sync-runtime.mjs`: PASS
  - duplicate-origin URL repair runtime assertion
  - empty/relative/absolute URL normalization assertions
  - production-contract schema migration accepted only when exact speaking identity matches
  - dialogue/speaker mismatch rejected
  - actual Retry click helper invokes `finishSceneClip` and emits userInitiated/allowSubmit trace

## Important limitation
No live paid Sync Labs generation was performed in this environment. Production acceptance still requires one deployed Retry attempt and confirmation that the trace reaches submit/poll/completed/adoption and that the synchronized player is audible after refresh/reopen.
