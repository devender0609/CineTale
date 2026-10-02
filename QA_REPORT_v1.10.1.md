# CineTale v1.10.2 QA Report

## Scope
v1.10.2 addresses the deployed failure in which pressing **Finish clip** could appear to do nothing. The release keeps the v1.10.0 durable-media / strict-provenance architecture and fixes the user-triggered synchronization action itself.

## Root causes fixed
1. **Finish clip used the same overloaded action path as Generate video.** The UI depended on a delegated pointer handler and could fail to provide durable progress feedback.
2. **User-triggered lip-sync called `ensureSceneLipSync(..., {quiet:true})`.** Errors inside the lip-sync pipeline were caught and converted to an empty result. The outer action could therefore return to `Finish clip` after a transient toast, making the action look like a no-op.
3. **No persistent pre-submit UI state.** TTS preparation and provider submission could occur without a durable scene status such as Preparing/Processing/Error.
4. **Exact source-shot identity was not preferred when selecting the dialogue line.** The sync audio selector recomputed a current primary coverage shot instead of first binding to the shot metadata stored with the source video.
5. **Provider-not-configured and busy states were insufficiently actionable in the user-triggered path.** These are now explicit persistent failures/wait states instead of quiet empty returns.

## Changes
- Added dedicated `finishSceneClip()` workflow.
- Finish clip now persists `lipSyncStatus='preparing'` before TTS/provider work.
- User-triggered synchronization uses `propagateErrors:true` and `userInitiated:true`.
- Exact sync failure text is stored on the scene and rendered under the visual (`Dialogue sync needs attention · ...`).
- A deployment with lip-sync disabled now surfaces a concrete configuration error instead of silently returning.
- Provider busy state is persisted and does not submit duplicate jobs.
- Added `sourceSpeakingShot()` to bind synchronization to the source video's saved speaking-shot ID/speaker/spoken line before any fallback to the current coverage plan.
- Scene video actions are directly bound during Studio rendering; the old scene-level pointerdown delegation path was removed for this action.
- Existing durable source video remains preserved on all Finish clip failures.

## Production contract retained
- No silent source movie is presented as a finished speaking clip.
- A finished speaking scene is one validated, durable synchronized AV file with embedded approved dialogue.
- Finish clip reuses a valid owned source video and does not trigger a replacement Veo generation.
- Final production still requires validated synchronized media for speaking scenes.

## Source-tree verification
- `node --check app.js`: PASS
- All API JS syntax checks: PASS
- All library JS syntax checks: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Regression scripts: **60/60 PASS**
- v1.10.2 dedicated Finish clip regression: PASS
- Deep QA coverage reported: 182 static IDs, 462 DOM references, 19 API routes, 3 local assets, 175 files.

## Important test-environment limitation
No paid production lip-sync job was submitted from this build environment because the deployed private provider credentials and browser/Vercel session are not available here. The build therefore does **not** claim that a live provider job has completed successfully. After deployment, one existing speaking scene should be used for the acceptance test. The important improvement in v1.10.2 is that any live configuration/provider/identity/TTS failure will now remain visible in the scene instead of appearing as a no-op.

## Deployment acceptance test
1. Open the existing scene that shows **Visual ready**.
2. Click **Finish clip** once.
3. The scene must immediately change to **Preparing approved dialogue…** and then **Finishing dialogue…**, or show a persistent exact error.
4. It must not regenerate the source video.
5. On success, one native video player must appear with embedded audible dialogue.
6. Refresh: same synchronized clip must remain playable.
7. Leave/reopen project: same synchronized clip must remain playable.
8. Other scenes must remain unchanged.
