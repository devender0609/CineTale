# CineTale v1.9.62 QA Report

## Production issue addressed
Live testing of Scene 2 showed the user could still play the raw Google/Veo source while dialogue synchronization was pending. CineTale then muted provider guide audio and started a separate browser-timed approved voice track. That path can sound correct while the mouth movement remains unrelated, which is exactly the mismatch observed. The UI also placed `Preparing final clip…` directly over the picture.

The uploaded failing Scene 2 clip was inspected directly. It is a 6.0 s, 1280x720 H.264/AAC file with `encoder=Google`, SHA-256 `3dfbc296bd09839532602629422a28077e677c1b63cc560e57fd3389af6d8f75`. It is a source clip, not a Sync Labs render, so it cannot be used as evidence that the final lip-sync stage succeeded.

## v1.9.62 changes
- Removed `Preparing final clip…` and all pending lip-sync wording from the video overlay.
- Unsynchronized speaking source clips are now visual previews only: muted, no native controls, and non-interactive.
- CineTale no longer plays a separately browser-timed approved voice over an unsynchronized speaking source video.
- Native video controls/audio are restored only when a distinct synchronized render has been returned, browser-validated, and marked `lipSyncValidated=true`.
- Pending synchronization state is shown below the video in the scene support area (`Dialogue sync in progress`, `Dialogue sync queued`, or `Dialogue sync needs attention`) rather than on top of the picture.
- Existing-source Studio migration remains enabled and now uses revision `v1.9.62`, so existing unsynchronized speaking clips are eligible for one controlled sync authorization after upgrade.
- Final Assembly production readiness continues to require a validated synchronized asset for speaking scenes.
- The Sync Labs pipeline revision remains `v1.9.56-production-sync-hardening`; this UI/playback hardening does not invalidate already-valid synchronized assets.

## Release validation
- package/config check: PASS
- smoke suite: PASS
- deep QA: PASS (177 static IDs, 451 DOM refs, 19 API routes, 106 files)
- scene audio regression: PASS
- approved voice mix regression: PASS
- dedicated lip-sync regression: PASS
- stable player lifecycle regression: PASS
- lip-sync status resilience: PASS
- sync adoption/resume regression: PASS
- carry-forward v1.9.48 through v1.9.61 regressions: PASS after updating expectations for the deliberately removed in-video pending label
- new v1.9.62 sync-gated playback regression: PASS
- full JS/MJS syntax sweep: PASS

## Live-provider limitation
This environment cannot execute the user's production Sync Labs/ElevenLabs/Vercel credentials. Therefore v1.9.62 does not claim that Scene 2 has completed a real paid lip-sync job. The production acceptance test is that Scene 2 remains non-playable as a speaking video while pending, then switches to a distinct Sync Labs-rendered asset with native controls once synchronization completes.
