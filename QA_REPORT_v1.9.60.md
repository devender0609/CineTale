# CineTale v1.9.60 QA Report

## Release focus
Automatic post-video dialogue synchronization and production-readiness gating for speaking scenes.

## Root issue addressed
A newly generated/regenerated Veo source clip could immediately appear as a ready scene even though the approved character dialogue had not yet been rendered into a validated synchronized Sync Labs asset. This allowed users to judge the unsynchronized Google/Veo source and allowed Final Assembly to count the speaking scene as ready too early.

## Changes
- Every new primary scene video invalidates any synchronized asset tied to the previous source clip.
- Speaking scenes are persisted as auto-sync pending after a new source video becomes ready.
- The exact fresh source clip is automatically sent through the existing approved-audio + Sync Labs pipeline.
- If another scene occupies the provider slot, the authorized scene remains pending and retries after the slot clears without creating duplicate jobs.
- Reload/open warmup may continue an explicitly authorized post-video synchronization, but does not blindly create new billable jobs for unrelated scenes.
- A speaking scene is production-ready only when its synchronized asset is validated and distinct from the source clip.
- Final Assembly now shows `SYNCING` for speaking scenes that have video but are not yet validated as synchronized.
- Prepare Final Assembly is blocked until selected speaking scenes have validated synchronized outputs.
- Non-speaking scenes retain normal video-ready behavior.
- Existing stable-player, approved-audio, canonical Sync Labs output, responsive player sizing, and balanced scene-card layout behavior are preserved.

## Validation completed
- package/config check: PASS
- smoke suite: PASS
- deep QA: PASS (177 static IDs, 451 DOM references, 19 API routes, 102 files)
- scene audio regression: PASS
- approved voice mix regression: PASS
- dedicated lip-sync/fallback regression: PASS
- stable player lifecycle regression: PASS
- lip-sync status resilience: PASS
- lip-sync adoption/resume regressions: PASS
- v1.9.48 carry-forward regression: PASS
- v1.9.50 Firefox playback regression: PASS
- v1.9.51 Sync Labs render-stage regression: PASS
- v1.9.52 canonical output regression: PASS
- v1.9.53 direct-upload regression: PASS
- v1.9.54 transient-provider safety regression: PASS
- v1.9.55 split-submit/recovery regression: PASS
- v1.9.56 production Sync Labs hardening regression: PASS
- v1.9.57 exact-fit media regression: PASS
- v1.9.58 responsive player regression: PASS
- v1.9.59 balanced scene-card regression: PASS
- v1.9.60 post-video sync + readiness regression: PASS
- full JS/MJS syntax sweep: PASS

## Live-provider limitation
This environment does not have the user's production Sync Labs/ElevenLabs/Vercel credentials. The live paid provider request itself could not be executed here. The implementation and provider-handling paths were validated with the existing controlled regression harnesses. Production verification should confirm that a newly regenerated speaking scene first shows as syncing, then switches to the distinct `/api/lipsync-video?provider=sync-labs&id=...` asset and becomes READY.
