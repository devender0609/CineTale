# CineTale v1.10.3 QA Report — Durable Source Ownership Repair RC

## Scope
This release candidate addresses the live failure shown after v1.10.2: a scene recorded as CineTale-owned could hold a `videoStoragePath` whose object returned HTTP 404. The prior restoration path could abort on that 404 and the Finish clip path could trust the path string without first proving the source bytes were still retrievable.

## Root cause fixed
- A recorded storage path was being treated as sufficient evidence of durable ownership.
- `hydrateSceneMedia()` could throw on a missing cloud object and never continue to local IndexedDB or legacy-source rescue.
- `Finish clip` could obtain a signed URL for stale metadata and only discover the missing object when the server tried to fetch it.

## v1.10.3 behavior
- `Finish clip` now calls `ensureSceneSourceForServer()` instead of trusting `videoStoragePath` metadata.
- CineTale verifies/reopens cloud source bytes before synchronization.
- If cloud storage returns 404 but a valid browser IndexedDB/runtime copy survives, CineTale re-uploads the source with upsert, reopens and validates it, repairs ownership metadata, and obtains a fresh signed URL.
- Hydration no longer aborts on cloud 404; it can continue to browser-local recovery and legacy rescue.
- If no valid cloud, browser, or still-live legacy source exists, the scene is explicitly marked `source_media_missing` and requires one source-video recreation. CineTale does not pretend that the scene is finishable.
- Existing v1.10.2 owned-source Sync transport remains: direct multipart under the provider limit, Sync asset upload for larger owned files, no provider-URL fallback solely because the owned source is large.

## Verification completed in source tree
- JavaScript/MJS syntax: PASS for all files checked with `node --check`
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Deep QA: 182 static IDs, 462 DOM references, 19 API routes, 3 local assets, 180 files checked
- Regression scripts: 63/63 PASS
- Dedicated v1.10.3 static ownership/repair regression: PASS
- Dedicated runtime regression simulating `cloud GET 404 + surviving IndexedDB source`: PASS
  - missing cloud object detected
  - local source bytes recovered
  - cloud object re-uploaded
  - repaired object reopened/validated
  - ownership metadata repaired
  - fresh signed server-readable source URL returned

## Not claimed
- No live Veo generation was performed.
- No live ElevenLabs generation was performed.
- No live Sync Labs lip-sync job was submitted.
- This environment does not prove Vercel/browser/provider production behavior. The deployed one-scene acceptance test is still required.

## Required deployed acceptance test
Use the same existing Scene 1. Do not regenerate it first.
1. Deploy v1.10.3.
2. Reopen the project and allow media restoration to settle.
3. Click Finish clip once.
4. If the browser-local source survived, CineTale should self-repair the missing cloud object and proceed to dialogue synchronization.
5. If no source bytes survive anywhere, CineTale should explicitly require a one-time source recreation rather than returning another misleading 404 loop.
6. On successful synchronization: one native playable AV player, audible approved voice, no duplicate audio, refresh persistence, reopen persistence, and scene isolation.
