# CineTale Studio v1.9.36 — QA / Release Report

## Stable character-ID voice continuity

This release hardens recurring-character voice continuity across scenes and episodes.

Changes:
- every cast member is normalized to a stable character `id`;
- each scene dialogue row receives a persisted `dialogueBindings[]` entry containing the matched `characterId` and visible speaker label;
- scene Listen/audio resolution now checks the stable character ID first and falls back to speaker-name matching only when an ID is not available;
- object-form dialogue that already contains `characterId`, `speakerId`, or compatible fields is honored directly;
- manual scene dialogue edits rebuild bindings while preserving an existing valid binding when the visible speaker label remains the same;
- common title/name variants such as `Mr. Lin` are normalized more safely, and ambiguous partial-name matches are no longer accepted blindly;
- the scene performance editor continues to keep `audioDirection` local to the scene, while the character's locked voice/performance settings remain project-level;
- existing projects are migrated automatically during load/save without requiring creators to rebuild scenes.

## Intended behavior

A locked David Lin voice follows David Lin everywhere the stored `characterId` appears. A scene can still override emotion/delivery through Scene performance direction without changing David's core voice identity. Reset to Auto or a deliberate Voice Studio change is required to change the character-level voice.

## Validation

- `node --check app.js`
- `npm run check`
- `npm run smoke`
- `npm run qa:deep`
- `node scripts-video-regression.mjs`
- `node scripts-voice-continuity.mjs`
- archive integrity check

## Live-provider limitation

Automated tests verify local identity binding, persistence wiring, UI routes and regression behavior without spending production provider quota. A deployed browser check is still required to confirm real ElevenLabs/Supabase behavior end to end.
