# CineTale v1.10.29 — Responsive Shot Plan Grid RC

## Scope
This release changes only the Story shot plan presentation and its release-version marker. The v1.10.28 shot inventory, credit-safety, media-recovery, dialogue-sync, and final-assembly logic are preserved.

## UI change
- Story shot plan is a full-width child of each scene card instead of being confined to the media column.
- No horizontal shot-strip scrolling.
- Wide desktop: 4 shot cards per row.
- Smaller desktop: 3 per row.
- Tablet: 2 per row.
- Mobile: 1 per row.
- Shot titles and descriptions wrap instead of truncating important story text.

## Source-tree verification
- JavaScript/MJS syntax: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: 90/90 PASS
- v1.10.29 responsive shot-grid regression: PASS
- Deep QA inventory: 188 static IDs, 464 DOM refs, 19 API routes, 3 local assets, 236 files checked before this report was added.

## Live-provider limitation
No paid Veo, ElevenLabs, or Sync Labs generation was executed in this environment. This remains a release candidate until the deployed browser UI is visually confirmed.
