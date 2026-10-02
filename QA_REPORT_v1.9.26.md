# CineTale v1.9.26 QA Report

## Scope

This build intentionally changes only the Projects opening interaction, plus version/cache-busting/test/documentation metadata. It restores the v1.9.17 project-card pattern while retaining the v1.9.25 quota-safe `openProject()` behavior.

## Code comparison

Compared with v1.9.25, application behavior changed only in the Projects rendering/open-handler block in `app.js` and the project-open CSS rules in `styles.css`. `index.html` changed only for the v1.9.26 cache-busting query string. Package/test/docs metadata were updated for this release.

## Automated regression

- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- `node --check app.js` — PASS
- `node --check scripts-smoke.mjs` — PASS
- Deep QA: 177 static IDs, 440 DOM references, 16 API routes, 3 local assets, 41 files checked

The smoke suite still exercises the existing image-provider fallback and ElevenLabs fallback negative paths; their expected simulated 429/400/422 diagnostic logs are not test failures.

## Project interaction verification

A Chromium DOM interaction harness was built from the exact v1.9.26 `openProject()` and `renderProjects()` function bodies. It verified:

- Beta project click → Studio → `Beta Project` — PASS
- Back to Projects → Alpha project click → Studio → `Alpha Project` — PASS
- Physical mouse click through Chromium input events on the project button → correct Studio project — PASS
- Duplicate action remains on Projects rather than opening Studio — PASS
- Quota-mode project click still opens the correct Studio project — PASS
- Project open control is a native `BUTTON` — PASS
- Computed underline state is `none` — PASS

Localhost navigation itself is blocked by the managed browser policy in this environment, so the browser verification used `Page.setDocumentContent` with the exact production interaction functions rather than navigating to a local development URL.

## Intentional non-changes

No intentional changes were made to authentication, cloud sync, image generation, visual persistence, story generation, anti-repetition, consent, voice, video generation/delivery, final assembly, top navigation styling, or other app workflows.
