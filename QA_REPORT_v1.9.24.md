# CineTale v1.9.24 — Project Interaction Stabilization QA

## Scope
This build fixes the repeated Projects-page opening failure without converting project cards into links or underlined controls. It preserves the v1.9.23 production baseline and changes only the project-opening interaction structure plus matching regression tests.

## Root-cause-oriented change
- Project management buttons remain normal native buttons in `.project-actions`.
- The non-management cover/title/body area is a dedicated `.project-open-area` with `data-project-open-area`, keyboard focus, and button semantics.
- A single delegated listener on the persistent `#projectsGrid` handles project opening after every cloud/local rerender.
- Management actions are intercepted first and do not trigger project opening.
- No anchor wrapper is used, so no underline/link styling is introduced.
- `openProject(id)` remains the single transition path: selected ID -> persistence -> Studio.

## Automated regression results
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- JavaScript syntax (`node --check app.js`) — PASS
- Deep QA: 177 static IDs, 441 DOM references, 16 API routes, 3 local assets, 37 files checked

## Real browser interaction test
A headless Chromium DOM interaction test was run against the actual v1.9.24 production JavaScript and CineTale page markup using two seeded projects.

Verified:
1. Projects view rendered both project open areas.
2. Mouse activation of `Alpha Project` changed the active view to `studio`, set the selected project ID to `p1`, and rendered `Alpha Project` in `#studioTitle`.
3. Returning to Projects and activating `Beta Project` changed the selected ID to `p2` and rendered `Beta Project` in Studio.
4. Keyboard `Enter` activation on the Alpha project open area opened Alpha correctly.
5. Clicking Duplicate remained on the Projects view and did not accidentally trigger Studio navigation.

Observed browser results:
- Alpha mouse open -> `{ active: 'studio', title: 'Alpha Project', current: 'p1' }`
- Beta mouse open -> `{ active: 'studio', title: 'Beta Project', current: 'p2' }`
- Alpha keyboard open -> `{ active: 'studio', title: 'Alpha Project', current: 'p1' }`
- Duplicate management action -> remained `{ active: 'projects' }`

## Styling checks
- No `<a>` wrapper for project opening.
- No native `<button>` wrapping the full project layout.
- No underline styling introduced.
- Visible keyboard focus remains on `.project-open-area`.

## Preserved systems
The change does not alter provider routing, IndexedDB visual persistence, cloud workspace synchronization, Google account chooser behavior, story anti-repetition, photo/minor consent, personal voice consent, ElevenLabs audio, dialogue-first video prompting, video delivery stabilization, safe framing, or final assembly.

## Live deployment acceptance
After deployment, the first acceptance test should be:
1. Projects -> click project A cover/title/body -> confirm project A opens in Studio.
2. Back to Projects -> click project B -> confirm project B opens.
3. Back -> click Rename/Duplicate once -> confirm the management action occurs without opening Studio.
