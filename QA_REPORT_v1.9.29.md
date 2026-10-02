# CineTale v1.9.29 QA Report

## Scope
This build is intentionally limited to the live Projects navigation race observed in the signed-in/cloud-synced app. The user reported that rapidly clicking Projects and then a project eventually opened it, indicating that navigation was being lost or overwritten during rerender/sync activity.

## Changes reviewed
- Added `state.projectNavigation` navigation ownership state.
- `openProject(id)` now:
  - validates the project;
  - acquires a short navigation lock;
  - increments a navigation epoch;
  - commits `state.currentId` immediately;
  - writes the lightweight current-project key immediately;
  - switches to Studio synchronously;
  - defers bulk persistence until after the navigation transition.
- `syncWorkspaceAfterAuth()` records the navigation epoch before its network request and preserves the project selected by any newer navigation while the request is in flight.
- While a project navigation owns the UI, cloud sync does not run a full Projects rerender over the transition.
- The persistent Projects grid captures primary-pointer activation on `pointerdown`, before a cloud rerender can remove the clicked project button between mouse-down and the later click event.
- Keyboard-generated click activation remains supported.

## Automated validation
Executed from the packaged v1.9.29 source:

- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- JavaScript/module syntax checks included by the suites — PASS
- 177 static IDs checked
- 441 DOM references checked
- 16 API routes checked
- 44 files deep-checked

Targeted smoke assertions confirm:
- persistent grid-level pointerdown navigation wiring is present;
- `openProject()` is the navigation path;
- navigation lock/epoch state is present;
- cloud sync checks the navigation epoch and preserves a newer navigation target;
- quota-safe persistence remains in place.

The deep QA intentionally exercises negative provider paths; logged Gemini 429/400 and ElevenLabs fallback messages are expected simulated failure-path tests, not build failures.

## Preserved behavior
No intentional changes were made to story generation, cast, consent gates, image generation/fallback, IndexedDB media persistence, ElevenLabs voice behavior, dialogue-first video, final assembly, auth account chooser, or cloud schema.

The v1.9.28 Projects toolbar polish and video MIME/container handling are retained.

## Live acceptance still required
This environment cannot reproduce the user's exact signed-in Firefox + production Supabase/Vercel timing. After deployment, verify one normal click only:

1. Confirm Settings → System Health reports `App build: v1.9.29`.
2. Open Projects once.
3. Single-click Project A once and confirm Studio opens Project A.
4. Return to Projects.
5. Single-click Project B once and confirm Studio opens Project B.
6. Do not rapid-click during this acceptance test.

If either single click is lost in production, capture the Firefox Console immediately; do not keep clicking, because the code-side race guards in this build are already active and the next diagnostic would need the browser event/runtime error itself.
