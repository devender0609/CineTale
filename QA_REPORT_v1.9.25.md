# CineTale v1.9.25 QA Report

## Scope
Project navigation reliability after repeated live reports that project cards rendered but did not open. This build preserves the v1.9.24 feature baseline and changes only the navigation/persistence boundary plus deployment version visibility/cache busting.

## Root cause addressed
A concrete failure mode existed in prior builds: `openProject(id)` set the selected project, then called the full `save()` routine **before** switching to Studio. If `localStorage.setItem()` threw `QuotaExceededError`—for example from legacy inline media or accumulated workspace data—the function exited before `setView('studio')`. The UI therefore looked clickable but did nothing.

v1.9.25 changes this order so project selection and Studio navigation happen immediately. Bulk persistence is queued afterward and local-storage writes are quota-safe. Generated/transient `data:` and `blob:` media are also stripped from persisted project metadata more aggressively.

## Project interaction changes
- Dedicated native `button.project-hitarea` overlays only the project cover/title/body surface.
- Rename / Duplicate / Archive / Delete remain outside that hit area.
- No anchor wrapper and no underline styling.
- Native button keyboard behavior (Enter/Space) is retained.
- Direct open handlers are attached after every Projects render.
- `openProject()` no longer depends on successful workspace persistence.
- App bundle and stylesheet URLs are cache-busted with `?v=1.9.25`.
- Settings → System Health displays `App build: v1.9.25`.

## Automated regression results
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- JavaScript/MJS syntax check across 24 files — PASS
- Deep QA: 177 static IDs, 440 DOM references, 16 API routes, 3 local assets, 40 files checked — PASS

## Chromium interaction validation
Because direct local URL navigation is blocked by the execution environment, a Chromium `about:blank` harness was used with the **exact v1.9.25 product functions** (`safeLocalSet`, `save`, `openProject`, and `renderProjects`) injected into a real DOM.

Validated:
1. Two project cards render.
2. Physical click on the visible **Beta Project title area** opens Studio with Beta Project.
3. Return to Projects; physical click on the visible **Alpha Project cover** opens Studio with Alpha Project.
4. A simulated `QuotaExceededError` on the bulk project localStorage key does **not** block project opening.
5. Duplicate remains a management action and does not navigate to Studio.
6. Project open control reports `text-decoration: none`.

Results:
- `CHROMIUM_PROJECT_INTERACTION_PASS`
- `CHROMIUM_PHYSICAL_CARD_CLICK_PASS`

## Preserved systems checked by regression suite
- Google OAuth account chooser
- Story/Short/Movie/Episode format integrity
- anti-repetition story generation wiring
- Story Review approval gate
- cloud workspace sync/RLS paths
- IndexedDB visual persistence
- OpenAI/Gemini visual routing/fallback
- photo + minor authorization gates
- personal voice consent path
- ElevenLabs voice handling and loudness mix
- no-crop generated media
- dialogue-first speaking-shot video prompting
- video byte-range delivery / request-storm protection
- final video assembly paths

## Live acceptance after deployment
The remaining live acceptance step is deployment-specific and must be checked on the production site:
1. Settings → System Health → confirm `App build: v1.9.25`.
2. Projects → click project A title/cover → correct project opens.
3. Back to Projects → click project B title/cover → correct project opens.
4. Rename/Duplicate/Archive/Delete remain separate.

If System Health does not show v1.9.25, the deployment/browser is not running this build and project-click behavior should not be judged against this ZIP.
