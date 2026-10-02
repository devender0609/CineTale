# CineTale v1.9.21 QA Report

## Release focus
This release corrects the live Projects-page failure observed after v1.9.20 while preserving the working production stack.

### Projects interaction fix
- Replaced project-card delegated click handling with an explicit native link for each project.
- Clicking a project's cover, title, description, or metadata opens that exact project in Studio.
- Each open target has its own direct listener after every render.
- Rename, Duplicate, Archive/Restore, and Delete remain independent controls.
- Native link semantics provide reliable mouse and keyboard activation.
- The selected project is written to `state.currentId`, saved, and then Studio is opened through the existing `openProject(id)` path.

### Google auth
- Google OAuth continues to send `prompt=select_account` so sign-in requests an account chooser rather than silently reusing the current Google account.

### Preserved production systems
- Create / Projects / Studio / Library navigation
- Story Review approval gate
- Episode / Short / Story / Movie format separation
- recent-project anti-repetition logic
- cast continuity
- photo/minor consent
- personal voice consent
- ElevenLabs TTS and health checks
- OpenAI/Gemini visual routing
- IndexedDB generated-media persistence
- safe/no-crop scene media
- dialogue-first video prompting
- range/lazy video delivery protections
- Supabase cloud workspace sync
- final assembly/export flow

## Automated verification
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- all JS/MJS syntax checks — PASS
- 177 static IDs checked
- 440 DOM references checked
- 16 API routes checked
- 34 files deep-checked
- Google account chooser assertion — PASS
- native project-open target assertion — PASS
- independent project-management actions — PASS

The quota/provider messages printed by deep QA are intentional negative-path simulations and are not test failures.

## Required live acceptance after deployment
1. Sign out and choose Continue with Google. Confirm the Google account chooser appears.
2. Open Projects and click the cover/title/body of Project A. Confirm Project A opens in Studio.
3. Return to Projects and click Project B. Confirm Project B opens instead.
4. Test Rename, Duplicate, Archive/Restore, and Delete separately and confirm none accidentally open the project.
5. Refresh the browser and repeat one project-open action to confirm cloud rerendering does not break it.
