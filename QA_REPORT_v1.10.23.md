# CineTale v1.10.23 — Shot Timeline Story Engine RC

## Release purpose
v1.10.23 changes final production from a scene-as-one-clip model to a planned shot-timeline model. It is intended to address the live failure where a technically playable final WebM did not feel like a coherent story and contained dialogue/audio gaps because long narrative beats were represented by only one short generated scene clip.

## Protected behavior
- Existing validated synchronized primary speaking clips remain reusable when their current source/voice/dialogue provenance still matches.
- Durable source/sync ownership, private cloud/browser persistence, and authoritative provider-audio playback remain in place.
- Final rendering still fails closed rather than presenting an unsynchronized speaking source as a finished clip.

## v1.10.23 changes
- Fast, balanced, and cinematic coverage planning no longer collapses a multi-dialogue scene to one clip. Every distinct dialogue turn gets its own planned speaking shot, plus non-speaking story coverage.
- Additional speaking coverage shots now have their own exact speaker/line/voice/source lip-sync identity, provider job, durable synchronized asset, restore path, and validation state.
- Automatic final production finishes the full planned shot timeline for every selected scene before final rendering.
- Final assembly walks planned shots in deterministic story order instead of treating one scene video as the whole narrative beat.
- Each speaking shot must be synchronized before final output can pass validation.
- Final timeline validation rejects missing planned shots, duplicate scene positions, duplicate media reuse, and unsynchronized dialogue shots.
- Generated clips are never modulo-looped to manufacture runtime. Shot duration is bounded by both the actual media duration and its planned duration.
- Audio routing is explicit per shot: synchronized dialogue at full level; unsynchronized speaking-shot audio suppressed; non-speaking source ambience kept low; narration begins on opening non-speaking story coverage and is stopped when dialogue begins so it cannot resume mid-sentence later.
- Coverage source and shot-sync hydration now use shot IDs and restore durable media after refresh/reopen.
- Final Assembly UI now reports scene production readiness and planned shot counts rather than implying one generated clip equals a 90–120 second scene.

## Static/source verification
- JavaScript/MJS syntax: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Deep QA: 188 static IDs, 464 DOM references, 19 API routes, 3 local assets, 223 files checked
- Non-core regression/runtime scripts: **83/83 PASS**
- New v1.10.23 shot-timeline regression: PASS

## Exact packaged ZIP verification
The release ZIP was extracted to a clean directory and the same verification was rerun against the extracted bytes.

- `node --check app.js`: PASS
- `node --check lib/production.js`: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: **83/83 PASS**
- Packaged deep QA: 188 static IDs, 464 DOM references, 19 API routes, 3 local assets, 223 files checked

## Important live-verification boundary
No paid Veo, ElevenLabs, or Sync Labs production generation was executed from this QA environment. Browser MediaRecorder rendering and the complete live provider workflow therefore remain production acceptance items. This release must remain an RC until a deployed project demonstrates the full flow:

1. missing planned shots are generated without replacing valid existing assets;
2. every speaking shot uses the correct approved voice and exact line;
3. all speaking shots are audibly synchronized;
4. final shot order follows the story plan without duplicate/random inserts;
5. narration/ambience do not create unintended silent gaps or resume mid-dialogue;
6. the final episode is coherent on first playback and after refresh/reopen;
7. the downloadable final file preserves the same picture/audio sequence.

## Scope note
v1.10.23 establishes the shot-timeline and audio-purpose foundation needed for future score/song tracks, but it does **not** claim that the requested song-over-video feature is complete yet.
