# CineTale v1.9.74 QA Report

## Release goal
This release keeps the existing v1.9.73 one-click final-video workflow and fixes the major persistence gap that remained: a rendered final episode could be described as persistent while the actual file lived only in that browser's IndexedDB.

The product goal remains: **Create final video automatically → one verified playable final episode → Download / Share**, without exposing normal users to technical assembly controls and without regenerating completed paid scene assets unnecessarily.

## v1.9.74 changes
- Final video rendering still uses the existing verified browser render pipeline, target runtime logic, selected scene order, approved voice mix, and synchronized speaking-scene media.
- Signed-in creators can now save the final video directly to a private Supabase Storage bucket tied to their user ID.
- Browser IndexedDB remains as a local safety copy.
- On refresh/login, CineTale restores the local copy first; if it is missing or unreadable, it can restore the account-saved cloud copy.
- Final-video metadata records the cloud object path only after a successful upload.
- Guest creators are told truthfully that the final file is saved only in that browser.
- Signed-in creators are told when the final file is saved to both the CineTale account and the browser.
- The Media Library uses the same final-video restoration path instead of being limited to local IndexedDB.
- Re-rendering a signed-in project's final video creates the new cloud file and best-effort removes the prior cloud final file.
- Deleting a signed-in project removes its account-saved final video before deleting project metadata.
- Deleting the profile workspace removes account-saved final videos as well as projects/stories.
- Pipeline metadata advanced to `pipelineVersion: 8`.
- Added `SUPABASE_FINAL_VIDEO_STORAGE_SETUP.sql` with a private bucket, 300 MB limit, allowed video MIME types, and per-user RLS policies.
- Added `scripts-v1974-cloud-final-persistence.mjs` regression coverage.

## Areas audited
The carry-forward suite covers Create, Projects, Studio, Characters/Cast, Episodes, Library, Settings, account/auth/cloud workspace sync, story approval gates, story/short/movie/episode format integrity, runtime targeting, responsive/no-crop media rules, character photo consent, visual generation and fallback logic, ElevenLabs voice selection/preview behavior, scene audio, lip-sync submission/status/adoption/resume, Preview Sequence, scene-player lifecycle, final selection/readiness, final rendering, final-player verification, MIME/Range behavior, automatic production resume/error handling, and owner/system-health wiring.

## Automated validation
- All `scripts-*.mjs`: **39 / 39 PASS**
- JS/MJS syntax sweep: **63 / 63 PASS**
- Deep QA: **182 static IDs, 462 DOM references, 19 referenced API routes, 131 files checked**
- Actual API files present: **20**
- Duplicate static HTML IDs: **0**
- Smoke tests: PASS
- Character-ID voice continuity: PASS
- Approved-voice mix: PASS
- Scene audio: PASS
- Lip-sync regressions/adoption/status/recovery: PASS
- Firefox player-lifecycle assertions: PASS
- Preview Sequence regressions: PASS
- Target-runtime final rendering / provider-audio isolation: PASS
- Final playback verification: PASS
- Final progress stability: PASS
- One-click final UX/render stability: PASS
- New cloud final-video persistence regression: PASS
- App/style cache-busting advanced to **1.9.74**: PASS

## Required Supabase setup for durable account-saved final videos
Run `SUPABASE_FINAL_VIDEO_STORAGE_SETUP.sql` once in the Supabase SQL Editor for the same Supabase project used by CineTale Auth. Until this is installed, final rendering still works and retains the browser copy, but cloud final-video upload will fall back to browser-only persistence.

## Live verification boundary
No paid Veo, ElevenLabs, or Sync Labs generation was intentionally submitted during this QA, so no provider credits were consumed. Existing provider-facing regression tests use mocks/stubs where applicable.

The container's installed Chromium did not complete a reliable headless browser session, so deployed Firefox/Vercel interaction cannot truthfully be claimed as live-browser verified here. The release was therefore validated with the strongest available static, syntax, route, state-machine, regression, and package checks. Production testing should start with the existing READY scene assets; no scene regeneration should be needed for the first v1.9.74 final-video test.
