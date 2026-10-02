# CineTale Studio v1.9.35 — QA / Release Report

## Voice persistence repair

This release addresses the observed v1.9.34 defect where a creator could choose and save a new character voice, then reopen or refresh and see the previous voice again.

Changes:
- explicit `Use & lock` writes the provider voice ID/name, lock state, revision and timestamp to the character record;
- the Voice Studio list now keeps the selected provider voice ID/name as explicit modal state;
- `Save voice settings` re-commits the currently selected voice instead of only saving performance controls;
- character voice changes trigger an immediate signed-in cloud workspace push in addition to browser autosave;
- cloud/local project merge preserves the newest per-character voice selection by `voiceSelectionUpdatedAt`, preventing a newer project snapshot with an older voice assignment from winning accidentally;
- locked voice resolution remains authoritative for scene Listen/audio generation;
- audio preview cache is cleared whenever the character voice changes.

## Validation

- `node --check app.js`: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- `node scripts-video-regression.mjs`: PASS
- ZIP integrity: PASS

## Live-provider limitation

Automated tests validate wiring, persistence logic, API contracts and regression behavior without spending production provider quota. A deployed browser test using the real signed-in CineTale workspace and ElevenLabs account is still required to confirm the provider response and Supabase environment end to end.
