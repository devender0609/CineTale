# CineTale Studio v1.8.4 QA Report

## Scope
Targeted reliability update from v1.8.3. No broad UI or provider changes were introduced.

## Changes
1. Restored the missing `finalAssemblyManifest(p, ep)` builder used by both manual Final Assembly and automatic final-video production.
2. Final assembly manifest now records selected scene order, clip URLs, planned timing, voice summaries, continuity/canon context, and efficient-fallback usage.
3. Replaced the creator-facing `Provider-limit protection · next clip in …` message with `Preparing next scene · starts in …` while preserving the existing request pacing.
4. Updated automatic-production confirmation copy to describe reliable paced generation without backend/provider terminology.
5. Added regression assertions requiring the final assembly builder to exist and requiring creator-friendly paced-generation copy.

## Validation performed
- `node --check app.js` — PASS.
- `npm run check` — PASS: merge-marker and JSON integrity checks.
- `npm run smoke` — PASS: auth, workspace/library, responsive scene controls, one-click final production, efficient video fallback, safe paced generation, transient retry behavior, final render, approved audio, download/share, final assembly, voice filtering, navigation, and DOM integrity.
- Dedicated runtime regression test for `finalAssemblyManifest` — PASS. Confirmed skipped scenes are excluded, selected-scene count and total duration are correct, `preparedAt` is present, and efficient-fallback state is preserved.

## Notes
The smoke suite intentionally exercises simulated quota/provider failures (including 429 and unsupported-image-mode responses) to verify fallback/error handling. Those console entries are expected test fixtures and are not failures of this build.

## Result
Targeted v1.8.4 changes PASS the available local syntax, integrity, smoke, and final-assembly regression tests.
