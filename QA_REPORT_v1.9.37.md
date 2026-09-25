# CineTale v1.9.37 QA Report

Date: 2026-09-23
Baseline: v1.9.36 Character Voice Continuity
Release focus: scene-video dialogue playback and audio reuse without regenerating provider video.

## Defect reproduced from field testing
An existing scene video could play normally while the character dialogue was only available through the separate **Listen** action. The provider video asset itself did not contain CineTale's approved ElevenLabs character track, so the Studio video preview appeared silent even though voice assignment and voice continuity were working.

## Implementation
- Added synchronized character/narrator dialogue playback to every generated scene video in Studio.
- Existing videos do **not** need to be regenerated just to hear current approved dialogue.
- The soundtrack is resolved from the existing `characterId`-based voice bindings, so a locked David/Maya voice remains authoritative across scenes.
- Added a persistent browser-local scene-audio cache using IndexedDB (`cinetale-scene-audio-v1`).
- Cache keys include scene, spoken text, voice ID, character ID, delivery direction, speaker profile, language and line order. Voice/dialogue/delivery changes therefore create a new audio asset instead of reusing stale audio.
- Scene audio is generated once when missing, then reused for subsequent scene playback and final rendering in the same browser profile.
- Added safe pause/seek/stop handling for scene video voice playback.
- Starting the standalone **Listen** preview now stops any scene-video voice playback to prevent double audio.
- Starting scene-video voice playback stops an active standalone voice preview to prevent overlapping speech.
- Final-sequence preview now plays the approved character/narrator voices with each scene rather than previewing raw silent provider clips.
- Final video rendering now reuses the same cached scene voice assets and advances the final pipeline marker to version 4.
- Added a small, non-provider-facing status badge on generated scene video: `Voice plays with scene` / `Preparing dialogue…` / `Dialogue synced` / error state.
- Cache-busting versions updated to v1.9.37.

## Validation completed
All JavaScript and MJS files were syntax-checked with Node.

Automated suites:
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- `npm run qa:scene-audio` — PASS
- `node scripts-video-regression.mjs` — PASS
- `node scripts-voice-continuity.mjs` — PASS
- `npm ci --ignore-scripts --no-audit --no-fund` — PASS

Deep QA counts:
- 177 static HTML IDs checked
- 448 DOM references checked
- 16 API routes checked
- 3 local static assets checked
- 56 project files checked
- duplicate IDs, missing route references, merge markers and CSS brace mismatches: none detected

Regression coverage retained:
- Story / Short / Movie / Episode format integrity
- Story approval production gate
- project-card navigation and prior rapid-click race protection
- Google account chooser and auth/cloud workspace wiring
- browser-local safety persistence
- character portrait workflow and consent gates
- identity-lock and no-crop generated-media rules
- visual provider primary/fallback/error paths
- runtime targeting
- narrator/character voice selection and persistence
- character-ID voice continuity across scenes
- ElevenLabs v3 -> multilingual model fallback
- scene video MIME/range handling
- video job recovery/cooldown behavior
- final assembly and final local video rendering
- final sequence preview

## Expected mocked error logs during QA
The smoke suite deliberately exercises Gemini quota exhaustion, unsupported image delivery, backup-provider routing, and ElevenLabs model fallback. Those console messages are expected test fixtures and did not fail the suite.

## What was not claimed as live-verified
This environment does not contain the user's deployed Vercel browser session or production provider secrets. I therefore did not spend real ElevenLabs/Veo/Gemini/OpenAI quota and cannot truthfully claim that a production provider request was completed from this container. Provider API contracts and fallback/error behavior were tested with the project's mocks; the browser-only Web Audio + IndexedDB path was syntax/static/regression validated but still requires one deployment smoke test in the user's actual browser.

## First deployment smoke test
Use the previously created Maya scene that already has a working video. Press Play on the scene video itself (not Listen). On first playback CineTale may briefly show `Preparing dialogue…`; it should then resume the video and play Maya's current approved voice. Replay the same scene: it should reuse the cached soundtrack. Then preview the final sequence and confirm voices are present there too. No Veo regeneration should be required for this test.
