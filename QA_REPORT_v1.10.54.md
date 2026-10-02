# CineTale v1.10.55 — Full Recovery & Credit-Safe Video State QA

## Release focus
This release closes the persisted-video lifecycle gap observed after v1.10.53 and hardens video status handling across reloads and restored projects.

### Fixed
- Video status requests are explicitly no-cache on both client and server, with a cache-busting query value on each poll.
- A terminal provider response (`done:true`) cannot remain in a rendering state.
- Persisted primary scene video jobs are reconciled automatically on app load across every project/episode.
- Persisted cinematic coverage jobs are also scanned; terminal failures are released and completed assets are adopted only after durable media verification.
- Project reopening does not silently start a replacement billable video request.
- Poll timeouts no longer discard an existing provider job. The operation is preserved to prevent accidental duplicate generation spend.
- If provider status cannot be verified because of a network/status-service problem, the existing operation remains preserved rather than being replaced.
- A completed result without a usable asset becomes a retryable failed state after reconciliation rather than rendering indefinitely.
- Existing identity, voice, dialogue, lip-sync, shot-plan, media-persistence, project-navigation, and final-assembly protections from prior builds remain in place.

## Automated validation — source tree
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Regression/runtime/QA scripts: **120/120 PASS**
- JavaScript/MJS syntax validation: **144/144 PASS**
- Deep QA inventory: **188 static IDs, 475 DOM references, 19 API routes, 3 local assets, 293 files checked**

## Specific v1.10.55 regression
`scripts-v11054-persisted-video-terminal-recovery-regression.mjs`: PASS

It verifies:
- no-cache provider status polling;
- no-cache API headers;
- automatic all-episode persisted-job reconciliation;
- terminal-state generation-lock release;
- no automatic paid resubmission during recovery;
- timeout preservation of an existing paid job;
- verification-error preservation of an existing job;
- completed cinematic-coverage recovery;
- completed-primary recovery only with a real asset.

## Provider test limitation
The automated smoke suite exercised provider error/fallback handling. The environment reported Gemini quota/image-delivery limitations and an ElevenLabs fallback condition. No new paid Veo/ElevenLabs/lip-sync production job was intentionally submitted solely for packaging QA. Therefore this report does **not** claim a fresh billable live-provider render completed end-to-end during packaging.

## Release gate
All available local automated checks, smoke tests, deep QA, regression/runtime scripts, and syntax validation passed before packaging. The exact packaged ZIP is re-extracted and re-tested separately before delivery.
