# CineTale v1.10.33 — Selected-Shot Audio Routing RC

## Scope
- Visual Story Shot cards no longer expose character dialogue playback.
- Visual shots show **No dialogue** and keep Listen disabled.
- Speaking shots preview only the selected shot's own spoken line using the assigned character voice.
- Declares and reuses `previewAudioContext` so enhanced browser playback does not throw `ReferenceError`.
- Preserves existing durable video/media and does not trigger paid regeneration.

## Validation
- JavaScript syntax check: PASS
- Full regression scripts: 97/97 PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS

## Live-provider limitation
The validation environment does not verify production provider/browser behavior against the user's deployed Vercel instance. Live TTS/lip-sync/provider calls must still be verified once after deployment. No provider-success claim is made from mocked/static tests alone.
