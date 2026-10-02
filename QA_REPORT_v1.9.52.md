# CineTale v1.9.52 QA Report

## Release focus
Canonical Sync Labs output adoption for speaking scenes. The synchronized render is now addressed by Sync Labs generation ID through a dedicated `/api/lipsync-video` route, so Studio/Preview/final assembly no longer depend on an expiring provider output URL or silently fall back to the original Veo URL after completion.

## Lip-sync changes
- Pipeline revision advanced to `v1.9.52-sync-labs-canonical-output`.
- Sync Labs status polling uses bounded long-polling (`wait=true&timeout=10`).
- Completed Sync Labs jobs return a stable CineTale generation-backed playback URL: `/api/lipsync-video?provider=sync-labs&id=<generationId>`.
- The generation ID is persisted with the scene.
- Server rejects a provider result that resolves to the source URL.
- Canonical playback route re-fetches the completed generation and streams the current output URL with Range support.
- Sync Labs output-host handling is hardened for documented/provider storage hosts.
- Sync-3 request uses `sync_mode: silence` to preserve the full source shot when dialogue audio is shorter.
- Active speaker auto-detection v3 is enabled for multi-face cinematic shots.
- Approved audio remains the audio used to drive Sync-3.
- Original Veo source remains a fallback only; it is not accepted as a valid synchronized result.

## Validation completed after final code changes
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- `npm run qa:scene-audio` — PASS
- `npm run qa:voice-mix` — PASS
- `npm run qa:lipsync` — PASS
- `npm run qa:player-lifecycle` — PASS
- `npm run qa:lipsync-status` — PASS
- `npm run qa:lipsync-adoption` — PASS
- `npm run qa:v1948` — PASS
- `npm run qa:v1950` — PASS
- `npm run qa:v1951` — PASS
- `npm run qa:v1952` — PASS
- Full `.js` / `.mjs` `node --check` syntax sweep — PASS
- Deep QA counts: 177 static IDs, 451 DOM references, 19 API routes, 85 files checked.

## Live-provider limitation
Automated QA validates the request, status, canonical adoption, playback-routing, fallback, and state-management paths. A production Sync Labs generation using the user's `SYNC_API_KEY` cannot be executed in this build environment, so visual lip-sync quality must still be confirmed with the deployed Scene 5 render.
