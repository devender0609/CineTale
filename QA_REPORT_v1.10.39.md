# CineTale v1.10.39 — App-Wide Shot Context & Release Audit RC

## Release scope
- Global selected-shot context binding: visible dialogue, selected speaker, character voice card, Listen route, video action and performance context follow the selected shot.
- Visual shots display truthful no-dialogue context; speaking shots display their exact speaker/line.
- Voice picker opens the selected speaking character rather than the first scene speaker.
- Edit Performance surfaces selected-shot context while retaining scene-wide performance editing.
- Existing durable video/audio/sync media is preserved; no production pipeline revision is invalidated.

## Source validation
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- API/lib JS syntax: PASS (23 files)
- App function duplicate-name audit: PASS (385 named functions, 0 duplicates)
- Static DOM duplicate-ID audit: PASS (188 IDs)
- Full carry-forward regressions: PASS (101/101)
- `scripts-v11039-selected-shot-context-regression.mjs`: PASS
- `scripts-v11039-app-wide-release-audit.mjs`: PASS

## Browser/live limitations
- A real Chromium execution pass was attempted in the container, but Chromium did not complete because the container browser/DBus environment hung before DOM output. This is recorded as **NOT VERIFIED**, not a pass.
- Live Vercel provider calls (Veo, ElevenLabs, external lip-sync, cloud persistence) were not spent/re-run for release QA. Provider behavior must be verified after deployment.

## Exact artifact gate
- ZIP integrity: PASS
- Exact ZIP extracted to a clean directory: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- API/lib syntax: PASS (23 files)
- Duplicate function-name audit: PASS (385 functions, 0 duplicates)
- Full carry-forward regressions from exact artifact: PASS (101/101)
