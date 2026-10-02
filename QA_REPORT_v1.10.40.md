# CineTale v1.10.40 — Pending Speaking-Shot Action Reliability RC

## Scope
Global repair for speaking-shot completion actions after saved-video / dialogue-sync transitions. The fix applies to arbitrary future scenes and shots, not only Scene 2 Shot 3.

## Functional changes
- `Finish Shot N dialogue` is directly bound to its action handler after render.
- Pending speaking-shot actions are explicitly re-enabled after card/state refresh unless that exact shot is currently in flight.
- Stale DOM `finishRunning` state can no longer permanently block a later completion attempt.
- Per-shot in-memory action locks prevent duplicate lip-sync submissions from double clicks.
- Existing durable video assets are preserved; pending completion invokes lip-sync only and does not regenerate Veo media.
- Selected-shot context, shot status, voice binding, timeline progress, and prior production safeguards are preserved.

## Source validation
- 105/105 `scripts-*.mjs` regression scripts: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Node syntax validation: 129 JS/MJS files, 0 failures
- Named app functions: 508 checked, 0 duplicate definitions
- Static DOM IDs: 188 checked, 0 duplicates
- Runnable stale v1.10.39 references: 0

## Live-provider limitation
No live Veo, ElevenLabs, or lip-sync provider request was made as part of packaging QA. Provider/network/browser behavior must still be verified on the deployed Vercel build. The release does not claim live external-provider success from container tests.
