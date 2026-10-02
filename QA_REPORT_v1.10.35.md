# CineTale v1.10.35 — Shot State Reconciliation RC

## Scope
Fixes stale Story shot plan state after individual shot generation. The authoritative saved media state now immediately refreshes the selected scene's shot cards, production statuses, scene coverage summary, readiness count, and progress bar during generation and on completion/failure, without regenerating existing media.

## Key guarantees
- Durable READY media remains authoritative and is never downgraded to PLANNED merely because the UI was stale.
- A generating coverage shot can surface its live production state from the saved operation record.
- Completion refresh occurs before the READY toast.
- Shot-card click handlers are rebound after the targeted timeline replacement.
- Existing READY shots and paid media are preserved; this release does not regenerate them.
- Selection remains separate from production status.

## Source validation
- `node --check app.js`: PASS
- `node --check api/video-job.js`: PASS
- Regression scripts: 99/99 PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS

## Live-provider limitation
No live Veo/lip-sync provider request was made during this packaging QA. Provider/browser behavior still requires one deployed production verification. The deterministic regression suite validates state reconciliation around mocked/provider-result transitions and existing persistence contracts.
