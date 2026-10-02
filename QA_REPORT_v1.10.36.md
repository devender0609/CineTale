# CineTale v1.10.37 — Scene Timeline Preview RC

## Scope
Adds a non-destructive **Play scene** preview for a completed multi-shot scene. This release does not change final assembly and does not regenerate any media.

## Scene Preview contract
- Preview is enabled only when every planned shot in the selected scene is READY.
- Playback order is deterministic and follows the canonical shot plan (Shot 1 → Shot N).
- A visual/non-speaking shot is always played muted. Raw provider audio is not authoritative for visual coverage.
- A speaking shot is playable with sound only when its synchronized approved-character media is validated.
- Missing/unrestorable media or lost READY/synchronization state stops the preview; CineTale does not skip, substitute, loop, or regenerate a shot.
- Preview uses existing durable media/hydration paths and does not call video generation, lip-sync submission, or final assembly.
- Closing the preview cancels active playback cleanly.

## UI
- Story shot plan shows **Play scene** only as an enabled action when all planned shots are READY.
- Incomplete scenes show the readiness count in the disabled preview control.
- Preview modal shows one player, the active shot number/type, and shot-order progress.
- Normal-user copy describes the playback policy without provider/debug details.

## Validation
Source tree:
- Targeted v1.10.37 Scene Preview regression: PASS.
- Carry-forward regression scripts: 97/97 PASS.
- `npm run check`: PASS.
- `npm run smoke`: PASS.
- `npm run qa:deep`: PASS.
- JavaScript syntax checks: PASS.

Exact packaged ZIP:
- The release ZIP was extracted into a clean directory and the same regression/check/smoke/deep/syntax gates were rerun before delivery.

## Live-provider/browser boundary
No paid Veo generation, external lip-sync submission, or final render was performed during package QA. The browser-level scene preview must still be verified on the deployed CineTale site with the user's existing five READY Scene 1 assets. The expected production test is: Play scene starts at Shot 1, advances through Shot 5 in order, keeps visual shots silent, and allows audio only on the validated speaking shot.
