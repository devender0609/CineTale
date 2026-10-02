# CineTale v1.10.31 — Dialogue Sync Recovery RC

## Scope
Targeted repair after the Scene 1 production test exposed two independent problems:
1. Browser warning caused by creating/resuming a realtime AudioContext during background dialogue preparation.
2. Sync-provider HTTP 403 Cloudflare block pages leaking raw HTML into CineTale and preventing approved dialogue synchronization.

## Changes
- Background dialogue preparation and approved-audio validation now decode through OfflineAudioContext; realtime AudioContext remains reserved for user-gesture playback/finalization paths.
- Cloudflare/WAF HTML is recognized server-side and converted to a stable `provider_access_blocked` error contract.
- Creator-facing state never stores or renders raw Cloudflare HTML.
- If Sync Labs is blocked before a generation is accepted and `FAL_KEY` is configured, CineTale safely falls back to the existing FAL lip-sync provider without regenerating the source video.
- If no secondary provider is configured, CineTale fails closed with a clear retry-later message while preserving the generated source video and approved voice.
- No change was made to source-video regeneration, final assembly gates, synchronized-media durability requirements, or the exact-approved-voice contract.

## Validation
- Syntax checks: PASS.
- `npm run check`: PASS.
- `npm run smoke`: PASS.
- `npm run qa:deep`: PASS.
- Scene audio, voice mix, lip-sync, player lifecycle, status resilience, and adoption regressions: PASS.
- New v1.10.31 Cloudflare block/failover runtime regression: PASS.
- Full repository regression sweep: 94/94 scripts PASS.
- Exact packaged ZIP is re-extracted and the same full regression sweep is rerun before release.

## Live limitations
No real provider request was sent from this offline QA environment. The Cloudflare 403 condition and safe failover were exercised with deterministic mocked provider responses. A deployed test is still required to confirm whether the production Vercel egress is accepted by Sync Labs or whether the configured secondary provider is used.
