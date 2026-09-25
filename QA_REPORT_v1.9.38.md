# CineTale v1.9.38 QA Report

## Release purpose

This release fixes the duplicate/ghost provider speech heard underneath a creator-approved character voice during generated-scene playback. It also removes the same provider speech from final rendering whenever an approved narrator/character track exists, while preserving character-ID voice continuity introduced in v1.9.36 and scene voice playback introduced in v1.9.37.

## Audio architecture changes

- Approved CineTale voice is now the sole audible dialogue source when spoken scene audio is available.
- Provider-native speaking audio is muted during scene playback, sequence preview, and final rendering instead of being quietly mixed underneath.
- Provider audio is restored if approved-voice preparation fails, so the app does not silently leave a scene without any audio when the replacement voice cannot be created.
- New speaking-shot prompts keep provider speech only as a temporary facial-performance guide, prohibit extra/background speech, and request a deterministic 0.2-second visual lead-in before the exact line.
- Approved voice playback uses the same 0.2-second lead-in in normal scene playback and final rendering.
- Creator UI no longer says "Dialogue synced"; it reports "Approved voice · source speech muted" and avoids claiming phoneme-level lip synchronization.
- Final render pipeline version advanced to 5.

## Lip alignment boundary

CineTale v1.9.38 improves visual/audio timing by making the video model articulate the exact dialogue and by using the same lead-in for the approved replacement voice. This is guide-based alignment, not a dedicated phoneme-level lip-sync transform. With the current configured provider set, arbitrary replacement TTS cannot be guaranteed to match every mouth shape/frame exactly. A dedicated lip-sync-capable provider would be required for that guarantee. This release intentionally does not mislabel guide alignment as exact lip sync.

## Regression validation performed

- Every `.js` and `.mjs` file passed `node --check`.
- `scripts-check.mjs`: PASS.
- Full `scripts-smoke.mjs`: PASS.
- `scripts-deep-qa.mjs`: PASS — 177 static IDs, 448 DOM references, 16 API routes, 3 local assets, 58 files checked at test time.
- `scripts-scene-audio-regression.mjs`: PASS.
- `scripts-voice-continuity.mjs`: PASS.
- `scripts-video-regression.mjs`: PASS.
- New `scripts-voice-mix-regression.mjs`: PASS.
- `npm install --ignore-scripts --package-lock-only`: PASS.
- `npm run check`: PASS.
- No unresolved source merge markers.
- Production bundle/cache version updated to v1.9.38.

## Functional areas covered by the existing full regression suite

Story, Short, Movie and Episode integrity; story approval and production gating; project navigation and race guards; Create/Projects/Studio/Library wiring; Google-account chooser and auth/cloud synchronization; project persistence; portrait/reference-photo consent; personal-voice consent; voice catalog/filtering; character-ID voice continuity; narrator/character TTS; scene dialogue playback; final assembly; final local video rendering; no-crop media behavior; safe framing; image-provider fallback; quota-aware Veo workflow; video MIME/range handling; saved video-job recovery; automatic production; final assembly manifest; and DOM/API wiring.

## Provider-test note

The smoke suite intentionally exercises simulated Gemini quota failures, unsupported image-delivery responses, and an ElevenLabs v3-to-multilingual fallback path. Those console messages are expected negative-path tests and are not release failures.

Live Google Veo/ElevenLabs/Gemini/OpenAI production calls were not made from the packaging environment because deployment credentials and the creator's authenticated browser session are not available here. Browser behavior that depends on those live services should therefore be verified once after Vercel deployment.

## Recommended live verification after deployment

1. Reopen the existing David scene that previously had a faint male provider voice under the selected female voice.
2. Play the scene video itself. Only the selected David voice should be audible; the provider guide speech should not leak through.
3. Confirm the badge changes to `Approved voice · source speech muted` after voice preparation.
4. Play the earlier Maya scene to confirm the same clean mix behavior.
5. Preview the two ready scenes in sequence and confirm no provider guide voice returns between clips.
6. Do not judge v1.9.38 as exact phoneme-level lip sync; verify that the speaking action is reasonably aligned to the approved line and no competing voice is audible.
