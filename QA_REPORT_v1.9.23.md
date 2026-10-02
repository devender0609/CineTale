# CineTale v1.9.23 — Project Interaction Reliability

## Scope
This build starts from v1.9.22 and fixes the confirmed Projects-page interaction defect without changing the working provider, cloud, media, consent, voice, video, or final-assembly architecture.

## Project opening fix
- Removed the project card's emulated `role="button"` interaction model.
- Each project now renders a dedicated native `<button type="button" class="project-open-area">` covering the project cover/title/description/meta area.
- The native open button has one direct listener and calls `openProject(projectId)`.
- Rename, Duplicate, Archive/Restore, and Delete remain separate sibling buttons, so no nested interactive controls are used.
- No anchor wrapper is used and no underline styling is introduced.
- Native keyboard Enter/Space behavior is retained automatically by the button element.
- Existing `openProject()` path still sets `state.currentId`, persists it, and enters Studio.

## Regression preservation
Checked/preserved:
- Google OAuth account chooser (`prompt=select_account`)
- Create / Projects / Studio / Library navigation
- Story Review approval gating
- Story diversity / anti-repetition logic
- Photo and minor consent gates
- Personal voice consent and ElevenLabs voice handling
- OpenAI/Gemini visual fallback and IndexedDB visual persistence
- No-crop generated media handling
- Dialogue-first video generation
- Video range delivery and anti-request-storm behavior
- Cloud workspace sync logic
- Final assembly paths

## Verification results
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- JS/MJS syntax checks — PASS
- 177 static IDs checked
- 440 DOM references checked
- 16 API routes checked
- 3 local assets checked
- 36 files deep-checked
- Native project-open control assertion — PASS
- Project ID -> `openProject()` wiring assertion — PASS
- No anchor project wrapper — PASS
- No underline project-open styling — PASS
- Project management controls kept separate — PASS

## Note on simulated provider messages
The smoke suite intentionally exercises negative/fallback paths (for example Gemini quota and ElevenLabs model fallback). Those console messages are expected test fixtures; the suite completed successfully.

## Live acceptance after deployment
1. Open Projects.
2. Click the cover/title/body area of Project A; Studio must open Project A.
3. Return to Projects and click Project B; Studio must open Project B.
4. Test Rename once and confirm it does not open the project unexpectedly.
5. Confirm no project title/body text is underlined.
