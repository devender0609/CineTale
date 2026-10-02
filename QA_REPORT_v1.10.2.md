# CineTale v1.10.2 QA Report

## Release purpose
Fix the remaining Finish clip transport failure revealed by the deployed message `The provided video URL is inaccessible.` The older-build comparison showed that URL-based cross-provider handoff was a recurring weak point. v1.10.2 keeps CineTale-owned durable source media authoritative and changes Sync Labs submission transport:

- source < 20 MB: send the actual video file as multipart;
- source >= 20 MB: upload the CineTale-owned bytes through Sync Labs Assets, register the asset, and submit the returned `assetId`;
- never fall back from an owned Sync Labs source to a provider-fetched video URL merely because direct multipart is too large;
- source retrieval failure is explicit and user-visible instead of becoming a misleading downstream provider URL error;
- generation submission includes an idempotency key;
- synchronized output still must be persisted and provenance-validated before READY.

## Historical-build findings carried forward
Reviewed v1.9.62, 1.9.63, 1.9.68, 1.9.69, 1.9.70, 1.9.71, 1.9.72, 1.9.73, 1.9.74, 1.9.77, and 1.9.81 as evidence rather than rollback candidates. Kept the useful concepts: sync-gated playback, recovery without needless regeneration, final-render gating, exact audio provenance, stable player/final progress, cloud persistence, and timed-shot architecture. Did not restore temporary-provider-URL dependence or silent-source-as-finished behavior.

## Source-tree validation
- JavaScript/MJS syntax: PASS across project files
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Regression scripts: 58/58 PASS
- v1.10.2 static transport regression: PASS
- v1.10.2 runtime 20 MB asset-transport regression: PASS
- Deep QA: 182 static IDs, 462 DOM references, 19 API routes, 3 local assets, 177 source files checked

## Runtime mock verified
A 20 MB CineTale-owned video was passed through the server-side lip-sync job handler with mocked provider endpoints. Verified sequence:
1. fetch CineTale-owned source bytes;
2. request provider asset upload URL;
3. PUT the actual source bytes;
4. register the uploaded VIDEO asset;
5. submit generation using `{type:'video', assetId:...}`;
6. include idempotency header;
7. no URL-input fallback.

## Not live-provider verified
No paid/live Veo, ElevenLabs, or Sync Labs generation was triggered for this release. Actual Vercel/browser/provider acceptance remains required. One existing speaking scene should be tested first; do not regenerate the visual unless CineTale explicitly proves the owned source itself cannot be retrieved.
