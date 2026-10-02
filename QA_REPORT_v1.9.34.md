# CineTale Studio v1.9.34 — QA / Release Report

## Scope
This release is based on v1.9.33 and targets the character-voice defect observed in the deployed app while preserving the project-navigation, Firefox video/MIME stabilization, cloud workspace, visual generation, consent, and final-assembly behavior already present.

## Voice fixes in v1.9.34
- Auto Voice now uses explicit character pronouns / voice-presentation data first and nearby story/scene context second.
- Auto Voice does **not** infer presentation from a character name, ethnicity, nationality, or culture alone.
- Existing non-locked Auto Voice assignments are re-evaluated when the stored voice conflicts with clearly established character presentation. This lets an existing character such as Maya move away from an incompatible prior auto-assignment without requiring a new project.
- Added optional `Pronouns` and `Auto Voice presentation` controls to the character editor.
- Manual `Use & lock` selection remains authoritative and stores the selected provider voice ID/name plus selection revision metadata.
- Manual voice changes invalidate in-memory audio preview caches so `Listen` cannot replay an old cached voice after a selection change.
- Scene playback resolves the current live character record/voice ID before requesting TTS.
- Scene voice labels now show the actual selected voice name instead of only `Assigned voice`.
- The Voice Studio filter is relabeled `Filter by voice presentation` to distinguish filtering from actually selecting/locking a voice.
- Generated-story schema now asks for pronouns / voice presentation only when supported by the story context; next-episode continuation preserves those fields.

## Regression / QA performed
- `node --check` across all JavaScript / MJS files: PASS.
- `npm run check`: PASS — JSON integrity and merge-marker checks.
- `npm run smoke`: PASS — Story/Short/Movie/Episode integrity, Google chooser, project opening/navigation race guard, quota-safe navigation, runtime targeting, no-crop media, auth/cloud sync, consent gates, quota-aware video, final assembly, voice filters and DOM wiring. v1.9.34 assertions also verify smart voice inference, manual voice-persistence metadata, cache invalidation, and prompt/schema safety rules.
- `npm run qa:deep`: PASS — static DOM/API/local-asset integrity and source-wide checks.
- `node scripts-video-regression.mjs`: PASS — video MIME/range regression coverage.
- Source audit for `TODO`, `FIXME`, merge artifacts, prior `finalAssemblyManifest is not defined`, and unsupported-format hard-coded errors: no unresolved source markers found.
- All JavaScript syntax checked independently: PASS.

## Provider-test boundary
Automated tests exercise provider routes with mocks and failure/fallback simulations. This environment does not contain the user's production Vercel secrets or authenticated browser session, so a true billed live call to ElevenLabs, Gemini/OpenAI image generation, Veo, Supabase, and the deployed Vercel domain was not made from this build environment. Production deployment still needs a short browser acceptance pass using the configured providers.

## Recommended deployment acceptance test
1. Open an existing project and confirm project cards open with one click.
2. Open Maya (or another clearly specified character) and verify Auto Voice chooses a compatible presentation when the story clearly establishes it.
3. Choose a different voice with `Use & lock`, close Voice Studio, click `Listen`, reload the project, and click `Listen` again; the same locked voice should remain.
4. Verify a previously rendered scene video plays without MIME/format errors or flicker.
5. Generate one missing scene video, verify rendering state clears correctly, then play it.
6. Check Create, Projects, Studio, Library, Settings/System Health in light and dark mode and at desktop/mobile widths.
7. Verify final assembly only after all intended scenes are ready.

## Release status
Local code/regression suite: **PASS**.
Live-provider/browser acceptance after deployment: **required before calling the production deployment fully verified**.
