# CineTale v1.10.14 QA Report

## Purpose
This release is a narrow production-diagnostics and player URL-boundary repair based on the live v1.10.13 diagnostic reports. It does not claim that live synchronized audio is fixed until a deployed Retry reaches the provider submission/poll/adoption path and the resulting synchronized clip is audibly verified.

## Changes
- Added capture-phase Retry telemetry before async work or scene re-rendering.
- Retry telemetry persists separately in session storage and is included at the top of every owner diagnostic report.
- Added visible owner-only `Retry clicks captured` summary with the last user-initiated stage.
- Added `retry-button-clicked-capture` diagnostics stage.
- Reworked `canonicalMediaUrl` so any malformed value containing more than one absolute HTTP(S) token resolves to the final absolute URL, independent of the current hostname.
- Corrected the source-provenance diagnostic call in `finishSceneClip` so it references the actual scene index and explicit user-initiated state.

## Verification
Source tree:
- JavaScript / MJS syntax: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: 74/74 PASS
- v1.10.14 retry telemetry + player URL regression: PASS
- Deep QA: 188 static IDs, 464 DOM refs, 19 API routes, 3 local assets, 205 files checked

## Live-provider limitation
No paid live Sync Labs generation or production ElevenLabs/Vercel browser session was executed from this QA environment. The deployed app still needs a user acceptance run: click Retry once, confirm `retryTelemetry.retryClickCount` increments, then inspect whether the flow reaches audio preparation, lip-sync submission, polling, persistence, authoritative adoption, and audible synchronized playback.
