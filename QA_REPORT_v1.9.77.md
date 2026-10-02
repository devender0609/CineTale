# CineTale v1.9.77 QA Report

## Release focus
This build addresses the newly observed case where a scene could display the correct current dialogue in Studio while a previously recovered synchronized MP4 contained stale/wrong spoken content. The release gate was expanded so a playable synchronized asset is not sufficient by itself to mark a speaking scene READY.

## Root cause found
In v1.9.76 and earlier, `recoverSavedLipSyncAsset()` could accept a previously saved playable synchronized asset and overwrite its stored semantic signature with the current scene signature. If the saved asset actually belonged to older dialogue, that destroyed the evidence needed to detect the mismatch and allowed the stale synchronized asset to become READY. This is consistent with the user-observed scene/audio mismatch even though the uploaded MP4 audio/video tracks themselves started at the same timestamp.

## Fixes
- Added a recovery-compatibility gate. A legacy recovered asset with no proof of semantic compatibility is no longer silently trusted.
- Added scene-audio provenance fields for new lip-sync submissions: exact scene semantic signature, SHA-256 approved-audio digest, and SHA-256 scene+audio request digest.
- Added a dialogue mutation race guard: if scene dialogue/voice bindings change while the lip-sync audio is being prepared, the stale submission is stopped.
- Bound long-running lip-sync polling to immutable scene ID plus project/episode identity rather than relying only on an array index.
- New synchronized-media submission recovery uses the cryptographic scene+audio request digest when available.
- Unsafe legacy recovered synchronized media is not READY and is shown as `Dialogue sync must be rebuilt` in Studio.
- New source generation clears old lip-sync provenance/recovery metadata.
- Carries forward v1.9.76 duplicate source/sync detection, atomic synchronized speaking clips, no repeated final coverage, final-video persistence, player stability, and provider-audio isolation.

## Uploaded-media forensic findings carried into this release
- Earlier uploaded Clip 1 and Clip 2 were byte-for-byte identical, confirming wrong cross-scene media reuse in the saved project state.
- Re-uploaded Clip 3 was byte-for-byte identical to the earlier Clip 3; re-uploaded Clip 5 was byte-for-byte identical to the earlier Clip 5.
- Clip 3 container timing: audio starts 0.000 s, video starts 0.000 s; audio 14.939 s, video 14.958 s.
- Clip 5 container timing: audio starts 0.000 s, video starts 0.000 s; audio/video 6.000 s.
- The prior final WebM was about 150.7 s and contained multiple long silent regions while picture continued. That final-assembly defect was addressed in v1.9.76 and remains protected here.
- Exact spoken-word correctness cannot be independently transcribed/verified in this container; the code now prevents known stale-recovery paths and binds future lip-sync audio cryptographically to the exact scene request.

## Automated validation
- 42/42 `scripts-*.mjs` regression/QA scripts passed after the final code changes.
- 66/66 JavaScript/MJS files passed `node --check` syntax validation.
- Deep QA passed: 182 static IDs, 462 DOM references, 19 API routes, 3 local assets, 138 files checked.
- Smoke suite passed across Story/Short/Movie/Episode integrity, account chooser/auth/cloud sync, navigation, project flows, media/no-crop behavior, quota-aware generation, final assembly, voice filtering and DOM integrity.
- Dedicated v1.9.77 regression checks stale recovery rejection, cryptographic audio provenance, dialogue mutation race protection, scene-ID-bound polling, reset hygiene, and creator-visible unsafe-sync state.

## Release limitations / not overclaimed
- No live Veo, ElevenLabs, Sync Labs, Google OAuth, Vercel, or deployed Firefox session was executed from this container.
- Automated tests validate code/state/API behavior and local media structure; they do not prove live provider output quality or exact mouth-to-phoneme quality on a future provider render.
- Because the existing project may already contain unsafe legacy recovered sync assets, v1.9.77 may rebuild only those affected speaking scenes when one-click final production needs them. This is intentional and safer than silently reusing unproven audio.

## Release gate result
PASS for packaging. No known code-level blocker remains in the paths covered by the available local tests. Live deployment verification is still required for provider/browser behavior.
