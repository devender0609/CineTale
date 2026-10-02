# CineTale v1.9.45 QA Report

## Scope
This release addresses two observed production defects: (1) scene video flicker/disappearance caused by automatic source swapping during Studio playback, and (2) approved voice onset lag that worsened visible lip timing.

## Implementation checks
- Mounted Studio video sources are pinned by project/episode/scene + lip-sync signature and cannot be changed by background FAL completion during that player lifetime.
- Play, pause, seek, and ended listeners do not hot-swap the scene video source.
- New lip-sync jobs and newly returned provider results clear `lipSyncValidated`; validation is restored only after browser media preflight succeeds.
- The lip-sync signature includes a v1.9.45 pipeline revision so previous timing outputs are treated as stale.
- Artificial 0.2 s voice lead-in removed.
- Leading silence in decoded approved voice audio is trimmed up to 650 ms with a small 35 ms safety pad before preview mixing and FAL submission.
- Speaking-shot prompt now keeps lips closed before speech and starts visible articulation with the first spoken phoneme.

## Automated validation
- `node --check app.js`: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- `npm run qa:scene-audio`: PASS
- `npm run qa:voice-mix`: PASS
- `npm run qa:lipsync`: PASS
- `npm run qa:player-lifecycle`: PASS
- Deep QA inventory: 177 static UI IDs, 448 DOM refs, 18 API routes, 68 files.

## Important live limitation
The production FAL API key and the user's Firefox/Vercel session are not available in the build environment. Therefore this package does **not** claim that a newly generated FAL clip has been visually verified frame-by-frame in production. The release does verify that the browser player is not hot-swapped during playback and that the audio submitted to FAL no longer contains the prior intentional 0.2 s delay and trims bounded leading TTS silence.
