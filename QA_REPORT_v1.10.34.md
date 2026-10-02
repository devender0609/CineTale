# CineTale v1.10.34 — Scalable Shot Status & Selection RC

## Scope
- Separates **current selection** from **production status** on every shot card.
- READY/GENERATING/DIALOGUE SYNC/RECREATE/PLANNED remain visible even when another shot is selected.
- Shot type (SPEAKING/ESTABLISHING/MOVEMENT/REACTION/DETAIL/VISUAL) is displayed separately from production state.
- Adds per-scene readiness progress (`ready/total` and percent) for longer episodes and movies.
- Preserves the current selected-shot navigation behavior and existing durable media.
- Does not trigger video, TTS, or lip-sync generation merely by rendering or selecting cards.

## Validation
- JavaScript syntax check: PASS
- Full regression scripts: 98/98 PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Exact packaged ZIP extraction followed by the same validation sweep: 98/98 PASS; check/smoke/deep QA PASS

## Live-provider limitation
This UI/status change does not require live provider calls. Provider-side generation and browser playback remain subject to the separate live deployment tests already being performed one step at a time.
