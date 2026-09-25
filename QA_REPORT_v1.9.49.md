# CineTale v1.9.49 QA Report

## Scope
This release targets the remaining production issue observed in Scene 5: stable video playback but missing approved character audio while a saved FAL lip-sync request remains unresolved.

## Fixes
- Added an authoritative-audio start gate for speaking source clips. The source video no longer runs ahead silently while approved voice assets are being prepared. Picture and approved voice begin together after preparation.
- Validated FAL output remains the only lip-synced authority. When the validated FAL file is mounted, its embedded audio is used directly and the browser voice overlay is not layered on top.
- Added stale FAL-request recovery: processing jobs older than 15 minutes are not resumed forever. CineTale clears the stale saved request and performs one bounded retry only. Repeated automatic paid retries are blocked.
- Preserved stable-player behavior and the no-horizontal-scroll final assembly layout from v1.9.48.
- Provider/debug lip-sync wording remains off the creative video surface.

## Automated validation
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS (177 static IDs, 451 DOM refs, 18 API routes, 78 files)
- `npm run qa:scene-audio` — PASS
- `npm run qa:voice-mix` — PASS
- `npm run qa:lipsync` — PASS
- `npm run qa:player-lifecycle` — PASS
- `npm run qa:lipsync-status` — PASS
- `npm run qa:lipsync-adoption` — PASS
- v1.9.48 carry-forward regression — PASS
- new v1.9.49 authoritative-audio/stale-job regression — PASS
- syntax check of all API JS files — PASS
- syntax check of all root MJS test files — PASS

The Gemini quota, Gemini delivery-mode, ElevenLabs fallback, and temporary lip-sync-status messages printed during the regression run are deliberate simulated failure-path tests and did not fail the suite.

## Live-provider limitation
The automated environment does not have the user's production Vercel/FAL/ElevenLabs session, so a real production FAL Sync-3 render could not be visually inspected here. The release therefore does not claim frame-perfect production lip synchronization until the deployed app returns and mounts a distinct validated FAL result.
