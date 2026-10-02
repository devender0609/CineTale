# CineTale v1.9.87 QA — Durable Scene Media

## Release purpose

v1.9.87 fixes the failure shown in the deployed project where previously generated scene players all reported “No video with supported format and MIME type found.” The browser error was a symptom: project records still held temporary provider/proxy URLs whose underlying media was no longer retrievable. The new release makes generated source clips and validated synchronized clips durable instead of relying on temporary provider URLs for long-term playback.

## Root cause confirmed in code

Earlier CineTale releases persisted final rendered videos, but individual scene source/synchronized videos were primarily stored as provider/proxy URLs. Those URLs can later stop resolving. When the proxy returns an error body instead of video bytes, Firefox/Chromium surface it as an unsupported-format/MIME error even though the originally generated MP4 may have been valid.

## v1.9.87 changes

- Adds dedicated IndexedDB persistence for scene media (`cinetale.scene.media.v1`).
- Archives each newly completed primary scene video immediately after generation.
- Archives each validated synchronized speaking video immediately after lip-sync validation.
- Signed-in users additionally save scene media into the already-configured private `cinetale-final-videos` Supabase Storage bucket under their own UID/project/episode/scene path. No new bucket or SQL is required.
- Studio playback prefers a durable browser object URL when available instead of a temporary provider URL.
- Private cloud copies are restored with authenticated Storage reads into local browser blobs; private tokens are not placed in video URLs.
- When a later lip-sync rebuild needs a source clip, CineTale can create a short-lived authenticated Supabase signed URL from the durable source copy instead of depending on the old provider URL.
- Existing legacy clips are probed off-screen. If the old provider URL is still alive, CineTale immediately imports it into durable storage.
- If a legacy provider URL has already expired and no durable copy exists, CineTale does not keep presenting the browser MIME-error player. It marks only that scene as needing one regeneration.
- New replacements clear stale durable source references before archiving the new media.
- Existing character/voice/dialogue/sync provenance gates from v1.9.86 remain in force.

## Important migration limitation

No application can reconstruct video bytes after the only remaining remote provider URL has expired and no browser/cloud copy exists. Therefore, a legacy scene whose old URL is already dead requires one new clip generation. After that regeneration, v1.9.87 stores the replacement durably so normal reopening should no longer depend on that temporary provider URL.

## Validation performed

- Full CineTale regression/smoke/deep QA suite: 51/51 scripts passed.
- JavaScript/MJS syntax validation: 75/75 files passed.
- Dedicated v1.9.87 durable-scene-media regression passed.
- Existing final-video persistence, player stability, MIME/range handling, strict character/voice/sync provenance, timeline, duplicate-media, and scene-isolation regressions all passed after the media persistence change.
- No paid Veo, ElevenLabs, Sync Labs, or FAL generation was triggered by this local QA.

## What is not claimed

This environment cannot reproduce the user's exact deployed Vercel/Supabase/provider account state or resurrect already-expired historical provider objects. Live verification of a newly regenerated scene must occur after deployment. The release is specifically designed so that once that new scene media is returned, CineTale immediately creates a durable local copy and, when signed in and Storage is configured, a private account copy.
