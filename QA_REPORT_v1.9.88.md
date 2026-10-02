# CineTale v1.9.88 QA Report

## Release purpose
v1.9.88 changes scene-media adoption from asynchronous best-effort archiving to a transactional ownership model. A provider URL is never considered a READY scene asset by itself.

## Core changes verified
- Primary scene video is downloaded and validated before adoption.
- Browser IndexedDB persistence is required for guest-mode ownership; signed-in production additionally uploads to the existing private Supabase Storage bucket and re-downloads that object to verify playability before READY.
- Storage paths are versioned so a failed replacement does not overwrite the previously adopted scene asset.
- Source-video READY requires durable ownership metadata, not merely `videoUrl`.
- Lip-sync READY requires durable synchronized-media ownership in addition to the exact character/voice/dialogue/shot provenance contract.
- The visible Studio player uses only hydrated durable runtime media; raw/unverified provider URLs are not mounted directly, preventing expired URLs from producing browser MIME-error players.
- Validated synchronized runtime blob URLs are recognized as synchronized media and remain audible instead of being incorrectly muted because they differ from the provider URL.
- Cinematic coverage shots are also persisted transactionally and final assembly uses their durable runtime media.
- Legacy provider URLs are probed/imported off-screen. If an old provider URL is already dead, it is marked expired and is not mounted visibly. Automatic production treats unowned legacy media as missing and will regenerate only when needed.
- Final-production readiness, missing-scene detection, next-missing-video flow, and sync targets now use durable ownership rather than raw `videoUrl` presence.

## Automated verification
- Full source regression/smoke/deep-QA suite: 52/52 scripts passed.
- JS/MJS syntax validation: 76/76 files passed before packaging.
- Added `scripts-v1988-transactional-owned-media-regression.mjs` covering transactional source adoption, durable sync gating, cloud reopen verification, versioned storage, no direct unowned provider playback, coverage ownership, and durable synced playback.

## Important limitation
No paid Veo, ElevenLabs, Sync Labs, or live Supabase account operation was triggered from this environment. Therefore the release does not claim live-provider success on the user's deployed Vercel account. The code path now refuses to mark a newly generated clip READY if durable ownership/verification fails, rather than silently falling back to a temporary provider URL.

## Database/storage
No new SQL migration is required if `SUPABASE_FINAL_VIDEO_STORAGE_SETUP.sql` has already been run. v1.9.88 stores scene media under the same private `cinetale-final-videos` bucket and the existing UID-scoped policies cover the new scene-media paths.
