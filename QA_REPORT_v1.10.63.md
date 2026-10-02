# CineTale Studio v1.10.63 QA Report

## Release focus
This release fixes two live issues reproduced from the user's Scene 2 / Shot 2 workflow:
1. Firefox briefly exposing native unsupported-format/MIME text while switching between saved Shot 1 and Shot 2 media.
2. Speaking-shot source video being saved while approved dialogue synchronization remained pending, leaving the visible source muted and the user hearing no approved dialogue.

## Grounded media evidence
The uploaded `7EKfluT6.m4v` was inspected with ffprobe/ffmpeg. It contains H.264 video plus an AAC-LC stereo audio stream at 48 kHz for the full 6.0 s duration. Audio level inspection measured about -22.7 dB mean and -7.8 dB peak. Therefore the uploaded provider asset itself is not silent; the user-visible no-audio symptom was caused by CineTale playback/synchronization state handling.

## Changes
- Unified non-primary selected-shot media with CineTale's decode-shield lifecycle.
- Hard-hides the native `<video>` element while it is hydrating/decoding so browser-native MIME/source text cannot flash through.
- Reveals the player only after `loadeddata` / `canplay`.
- Adds selected-shot lifecycle binding for generated coverage clips.
- Distinguishes `DIALOGUE SYNCING` from generic video generation.
- Persists speaking-shot synchronization as an authorized continuation of the user's Generate Shot action.
- Resumes already-started coverage-shot sync operations on Studio reopen without starting duplicate video generation.
- Clears sync-auto-pending after a validated synchronized clip is durably adopted.
- Keeps unsynchronized speaking source video visual-only; CineTale never substitutes detached TTS audio or treats provider-guide speech as approved dialogue.
- Preserves v1.10.59 canonical coverage reconciliation, v1.10.60 terminal-provider handling, and v1.10.62 provider-policy prompt safeguards.

## Validation
- 129/129 script-level regression/runtime/QA checks passed.
- 153/153 JavaScript/MJS syntax checks passed.
- `npm run check` passed.
- `npm run smoke` passed.
- `npm run qa:deep` passed.
- Deep QA inspected 188 static IDs, 476 DOM references, 19 API routes, 3 local assets, and 313 files.
- New v1.10.63 selected-shot media/audio lifecycle regression passed 12/12 checks.

## Live-provider limitation
No additional paid Veo or lip-sync job was submitted for packaging QA. Live acceptance still requires the deployed application to resume/finish the already-authorized Shot 2 dialogue synchronization and verify audible approved dialogue in-browser.
