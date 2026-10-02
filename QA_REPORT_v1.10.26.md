# CineTale v1.10.26 QA Report

## Release focus
Episode/media restoration safety for existing projects after the v1.10.24/v1.10.25 migration regression.

## Implemented safeguards
- Cloud remains authoritative for which project IDs exist, so deleted projects are not resurrected from stale browser copies.
- For the same project ID, richer local episode/scene production state is merged into a sparse cloud copy instead of being erased.
- Before local/cloud saves, CineTale records bounded browser recovery snapshots for episodes that still contain scenes.
- If an episode opens with zero scenes, CineTale automatically attempts recovery from the browser snapshot first.
- If no snapshot is available, CineTale inventories the existing `cinetale.scene.media.v1` IndexedDB store and can reattach saved scene media when trusted final-assembly/timeline metadata still identifies those scenes.
- Recovered synchronized media is **not** automatically marked lip-sync validated; recovery remains fail-closed until story/provenance binding is trustworthy.
- If media exists but trusted scene metadata is insufficient, CineTale reports the orphaned saved-media condition and explicitly tells the user not to generate new clips yet.
- No automatic regeneration is performed by the recovery path.

## Source-tree verification
- JavaScript syntax (`node --check app.js`): PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: **87/87 PASS**
- New episode/media recovery regression: PASS
- New production-state merge runtime test: PASS
- Deep QA inventory: 188 static IDs, 464 DOM references, 19 API routes, 3 local assets, 229 files checked

## Important live limitation
The exact amount recoverable on a deployed browser depends on what persisted evidence still exists there (same-project local workspace state, CineTale recovery snapshot, IndexedDB scene-media blobs, final-assembly metadata, timeline-validation metadata, and/or cloud storage references). This build deliberately does not invent missing scene metadata and does not claim an orphaned media file belongs to a scene without trusted identity evidence.

## Live acceptance gate
1. Deploy v1.10.26.
2. Open **The Shifting Frame → Episode 01 · Silver Gelatin**.
3. Do **not** click Create final video.
4. Wait a few seconds for automatic recovery.
5. Confirm whether Scene production restores the saved scenes/clips.
6. If it cannot safely reattach them, note the recovery message/count shown rather than generating new media.
