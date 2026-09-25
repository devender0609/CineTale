# CineTale v1.9.61 QA Report

## Live defect addressed
A speaking Scene 2 source video generated immediately before v1.9.60 deployment persisted after upgrade, but v1.9.60 only auto-authorized clips generated *after* its new hook existed. On Studio reopen the scene had `videoUrl` but no `lipSyncAutoPending`, so the warmup correctly refused to spend a Sync Labs job and no `lipsync-job` request appeared. The UI still said `Video ready`, which was also misleading.

## Fix
- One-time Studio migration authorizes existing included speaking source clips that have no validated synchronized asset.
- Migration is revision-gated (`v1.9.61`) so each scene is authorized only once.
- Existing active jobs are left untouched.
- A current-signature terminal error is cleared once for this migration so a previously blocked source can retry under the now-paid Sync Labs setup.
- Unsynchronized speaking source clips display `Preparing final clip…` instead of the false `Video ready`.
- Final Assembly production-readiness gating remains unchanged: speaking scenes are READY only after validated sync.

## Release validation
See command output from the release run; all carry-forward suites plus `qa:v1961` pass before packaging.
