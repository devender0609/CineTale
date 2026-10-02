# CineTale v1.10.0 — Exhaustive Release-Candidate QA Report

## Release intent
CineTale is a story-to-cinematic-media studio. The production contract for a speaking shot is: durable source visual → exact approved voice/audio → exact-shot lip-sync → durable synchronized AV → one native playable finished video. A speaking scene is not READY merely because a video exists.

## Root causes and defects corrected in this audit
1. **Silent finished-looking fallback:** a validated synchronized speaking clip could fail playback and recovery could fall through to source/coverage footage. This made a scene look playable while dialogue was absent. Validated synchronized scenes now have only the synchronized asset as their Studio playback candidate; a failure is surfaced instead of silently substituting source footage.
2. **Ambiguous unfinished speaking player:** the unfinished source was displayed as a muted/clickable `<video>`, which repeatedly looked like the finished scene. It is now represented as a still “Visual ready” production preview. Only the validated synchronized AV becomes a normal `<video controls>` player.
3. **Sync-only repair destroyed source ownership:** integrity repair previously called the new-source reset path and cleared durable source metadata. Sync-only repair now clears only the synchronized derivative and preserves the owned source.
4. **Saved synchronized media could be re-adopted before durable ownership:** legacy/recoverable synchronized output is now persisted durably before it is restored to validated READY state.
5. **MP4-family MIME inconsistency:** durable media hydration/persistence now normalizes MP4-family blobs with an `ftyp` signature to `video/mp4` for browser playback compatibility.
6. **Final preview used provider sync URL:** final sequence preview now uses CineTale’s hydrated durable synchronized asset and never directly depends on the temporary provider lip-sync URL.
7. **Final render after refresh could start before media hydration:** source, synchronized, and coverage assets are rehydrated before render entries are built.
8. **Duplicate-media content validation fingerprinted temporary URLs:** content fingerprints now use hydrated CineTale-owned runtime assets.
9. **Validated-sync restore could show a blank media surface:** while the durable synchronized asset is hydrating, the Studio now shows a clear “Restoring finished clip…” state instead of a blank player or a silent source substitute.
10. **Normal-user diagnostics exposed provider details:** normal System Health is now capability-level. Live route/provider/model verification controls and detailed diagnostics are owner-only.
11. **Stale release/test metadata:** package lock, smoke label, README current-release contract, and old regression assertions were aligned to v1.10.0. Historical notes remain clearly labeled as historical.

## Major workflow areas audited
- Create: Story / Short / Movie / Episode setup, story input, genre/language selection, story planning, saved drafts.
- Projects: direct project opening, search/filter/sort, autosave/cloud merge paths, duplicate/archive/delete-related project lifecycle logic.
- Studio: scene rendering, per-scene isolation, generated art, Listen voice preview, source video generation, Finish clip, media hydration, synchronization, player lifecycle, controls, errors and recovery.
- Characters & voices: character editing, continuity fields, manual voice lock/override, narrator voice, consent-gated personal voice workflow.
- Episodes: continuation controls, episode list/creation/deletion paths and project continuity state.
- Library: stories, characters, media and voice surfaces.
- Final assembly: selected-scene readiness, durable media hydration, synchronized embedded audio, no detached dialogue overlay, duplicate-media integrity, full video persistence/download/share.
- Account/settings: Google account chooser, auth session restoration, profile/cloud workspace, backup/import, delete controls, theme, usage, health/owner separation.
- Backend routes: syntax checked for all API modules and local library modules; deep QA cross-checks app/API references.

## Verification results — source tree
- `node --check app.js`: PASS
- `node --check api/*.js`: PASS (20 files)
- `node --check lib/*.js`: PASS (3 files)
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
  - 182 static IDs checked
  - 463 DOM references checked
  - 19 routed APIs checked by deep QA
  - 3 local assets checked
  - 173 files checked
- All regression scripts: **59/59 PASS**
- `npm run qa:v1100`: PASS

The smoke/deep harness intentionally exercises mocked failure/fallback branches as well; console messages about quota/provider failures during those tests are expected test stimuli, not live provider calls.

## Browser/live-provider verification
A local HTTP server was started successfully and served the app. A Chromium 144 headless run was attempted, but Chromium did not reach page execution in this container because its DBus/zygote startup environment hung. Therefore this release is **not claimed as browser-verified** in this environment.

No new paid Veo/image/voice/lip-sync generation was intentionally triggered during this audit. The user-provided `.m4v` from the prior test was independently shown to contain a real stereo AAC audio stream, so the observed deployed silence cannot be explained by an absent audio track in that file alone.

## Required deployed acceptance gate
Use ONE existing or newly finished speaking scene only:
1. If an owned source already exists, do not regenerate it.
2. Finish dialogue/sync.
3. The scene becomes one native video player with standard controls.
4. Play/Pause/seek/volume work.
5. Approved character voice is audible from the synchronized video itself.
6. Correct on-screen speaker and line identity are preserved.
7. No duplicate dialogue audio is heard.
8. Refresh: same synchronized clip remains playable/audible.
9. Leave and reopen project: same synchronized clip remains playable/audible.
10. Other scenes remain unchanged.
11. If the synchronized asset cannot be restored, CineTale must show a repair/error state; it must not silently show the source video as a finished speaking scene.

## Release statement
v1.10.0 is the strongest statically/regression-tested CineTale build produced in this environment and removes the architectural fallback that could present a silent source as a finished speaking scene. It is a **release candidate**, not a claim that live Vercel/browser/provider acceptance has already passed. The deployed one-scene acceptance gate above remains mandatory before calling the production issue resolved.

## Exact packaged ZIP verification
After creating the distribution ZIP, the archive was extracted to a new clean directory and the release gates were rerun against that extracted copy:
- app/API/lib JavaScript syntax: PASS
- all regression scripts: **59/59 PASS**
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- `npm run qa:v1100`: PASS

This packaged-copy rerun verifies that the distributed archive contains the same statically validated release behavior as the audited source tree.
