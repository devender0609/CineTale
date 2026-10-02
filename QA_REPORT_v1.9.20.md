# CineTale Studio v1.9.20 — Full Interaction & Auth Stabilization QA

## Scope
This release starts from v1.9.19 and preserves the working visual persistence, cloud workspace, dialogue-first video guidance, video delivery stabilization, consent gates, provider fallback, story diversity, no-crop media and final assembly behavior.

Confirmed live issues addressed:
1. Google OAuth silently reused the currently active Google account instead of presenting account choice.
2. Project cards could render correctly yet fail to open reliably when selected.

## Fixes
### Google account choice
- Google OAuth now sends `prompt=select_account` through the Supabase authorize flow.
- Existing Supabase callback/session restoration logic remains unchanged.
- Email/password sign-in, recovery, sign-out and cloud workspace logic remain unchanged.

### Projects interaction
- Added a single `openProject(id)` transition path.
- Entire project card is an interactive target.
- Project actions (Rename, Duplicate, Archive/Restore, Delete) remain isolated and do not trigger project opening.
- Added delegated click handling so card opening survives rerenders/cloud refreshes.
- Added Enter/Space keyboard activation.
- Added focus-visible/hover affordance and an Open project hint.

## Regression areas checked
- Create / Projects / Studio / Library navigation wiring
- account modal / Google OAuth / email auth / recovery / sign-out
- cloud workspace sync and deletion semantics
- project filtering/sorting/rename/duplicate/archive/delete
- story formats: Episode, Short, Story, Movie
- story approval gate and anti-repetition context
- cast editing and portrait/photo consent including minor authorization
- image generation/fallback and IndexedDB visual persistence
- ElevenLabs TTS, voice filtering, personal voice consent path
- video generation/status/delivery, byte-range proxy and lazy video rendering
- no-crop media behavior
- final assembly paths
- responsive/static DOM integrity

## Final automated results
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- static IDs checked: 177
- DOM references checked: 440
- API routes checked: 16
- local assets checked: 3
- files deep-checked: 60
- Google chooser regression assertion: PASS
- project delegated click assertion: PASS
- project keyboard activation assertion: PASS
- project hover/focus affordance assertion: PASS

The negative-path Gemini 429/image-delivery and ElevenLabs model-fallback logs produced during QA are intentional simulated failure-path checks.

## Live acceptance still required after deployment
Automated QA cannot use the production browser's Google account session or the user's production secrets. After deployment verify:
1. Sign out, choose Continue with Google, and confirm Google presents account selection.
2. Projects: click the cover/title/body of at least two different project cards and confirm the chosen project opens in Studio.
3. Confirm Rename/Duplicate/Archive/Delete still perform only their intended action.
4. Run one existing image, voice and video action to ensure production providers remain healthy.

No production provider keys are included in the package or QA output.
