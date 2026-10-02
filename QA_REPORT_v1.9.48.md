# CineTale v1.9.48 QA Report

## Scope
This release addresses two user-reproduced production issues from v1.9.47:
1. A speaking scene could continue to play/export the original Google/Veo source while a FAL lip-sync job was still pending or only started on first playback.
2. The **Prepare final episode** scene cards required horizontal left/right scrolling.

## Evidence from the uploaded production clip
The uploaded `cinetale-clip(4).mp4` is 6.0 seconds, H.264/AAC, with encoder metadata `Google` and SHA-256:

`bb42d681a940f99a125543758c2d1d7817e1781ec2309a6183bcdaa69e97734f`

That hash is identical to the earlier Scene 5 source clip supplied during testing, so it is not a distinct FAL-rendered lip-sync result. v1.9.48 therefore does not treat source playback as proof of successful synchronization.

## Lip-sync changes
- Speaking scenes with an existing generated video now **start or resume dialogue synchronization automatically in the background when Studio renders**, instead of waiting for the first Play click.
- Existing in-flight v1.9.46/v1.9.47 queue jobs remain compatible; the input signature was intentionally preserved to avoid duplicate paid FAL submissions.
- Only a distinct, browser-playable, validated FAL result may become `scenePrimaryVideoUrl`.
- Active playback is never destroyed to adopt a new result; the synchronized asset is mounted only when safe.
- **Final Sequence Preview no longer hard-codes `scene.videoUrl`.** It attempts to finish/resume synchronization for speaking scenes and then resolves `scenePrimaryVideoUrl`, so a validated synchronized asset is used when available.
- Final rendering already resolves synchronized assets through `prepareFinalSceneAsset`; this behavior is preserved.
- Provider/debug wording remains out of the video surface; scene playback shows only normal creative UI status.

## Prepare final episode layout changes
- Replaced the horizontally scrolling final scene strip with a responsive CSS grid.
- Desktop: cards wrap to the available width.
- <=900 px: 3 columns.
- <=680 px: 2 columns with reduced typography.
- <=430 px: 1 column.
- No horizontal scrolling is required for the final scene cards.

## Validation run after final code changes
- Full JavaScript/MJS syntax sweep: **PASS**
- `npm run check`: **PASS**
- `npm run smoke`: **PASS**
- `npm run qa:deep`: **PASS** — 177 static IDs, 451 DOM refs, 18 API routes, 3 local assets, 76 files
- `npm run qa:scene-audio`: **PASS**
- `npm run qa:voice-mix`: **PASS**
- `npm run qa:lipsync`: **PASS**
- `npm run qa:player-lifecycle`: **PASS**
- `npm run qa:lipsync-status`: **PASS**
- `npm run qa:lipsync-adoption`: **PASS**
- `npm run qa:v1948`: **PASS**

The Gemini quota, unsupported image-route, ElevenLabs fallback, and simulated temporary FAL network messages printed during QA are intentional negative-path fixtures used by existing regression tests; they did not cause test failures.

## Live-provider limitation
The local QA environment cannot authenticate into the user's production FAL account or reproduce the exact deployed Firefox/Vercel session. Therefore this report does **not** claim that a live FAL render has been visually proven frame-perfect. What is verified is that v1.9.48 proactively starts/resumes synchronization, preserves existing paid queue work, only adopts a validated distinct FAL result, uses that result in final preview, and no longer requires horizontal scrolling in the final scene selection area.
