# CineTale v1.9.85 QA Report

## Release objective
Eliminate Studio scene-video flicker/reloads while preserving scene-local recovery, playable media, audio safety, lip-sync provenance, timed-shot planning, and final-assembly protections.

## Media/player fixes verified
- Existing scene `<video>` elements remain mounted during ordinary Studio state updates.
- Existing `.scene-visual` containers remain attached; metadata/support/actions are patched around the player instead of re-parenting it.
- No source hot-swap occurs merely because background lip-sync validation finishes.
- No source hot-swap occurs when a clip ends.
- Scene recovery probes candidate URLs off-DOM and performs at most the required visible recovery handoff.
- A storyboard/poster layer masks the browser's undecoded/0:00 surface until a real frame is decoded.
- Media lifecycle listeners are bound once per mounted player.
- Video opacity/transform transitions are disabled to avoid visual flashing during state changes.
- Background lip-sync recovery is deferred until the browser has had time to mount/decode visible scene media.
- Technical/provider state remains outside the video surface.

## Full source validation
- `scripts-*.mjs`: **48 / 48 passed**
- JavaScript/MJS syntax checks: **72 / 72 passed**
- Deep QA/smoke/regression suites passed, including historical CineTale regressions through v1.9.83.

## Browser media lifecycle validation
A headless Chromium harness loaded the current v1.9.85 application logic with three of the user's previously supplied CineTale MP4 clips.

Verified:
- **3 / 3 players decoded successfully** (`readyState=4`, 6.0 s each).
- An intentionally invalid primary scene source recovered to the valid scene-specific fallback.
- The exact Scene 1 `<video>` node survived an unrelated Scene 2 framing update.
- **0 additional `loadstart` events** on Scene 1 during that update.
- **0 `src` mutations** on Scene 1 during that update.
- **0 player removals/re-parenting events** on Scene 1 during that update.
- Scene 1 playback continued advancing while Scene 2 changed.
- Reaching the end of Scene 1 caused **no remount, no source mutation, and no extra media load**.
- All three players reached `media-loaded`; none remained presented as a usable 0:00/0:00 player.
- Browser console/page errors during the harness: **0**.

The harness used an isolated in-memory browser origin because this execution environment blocks ordinary local HTTP/file navigation by administrator policy. The application DOM, CSS, current app logic, and the supplied MP4 bytes were exercised in Chromium; live Vercel/provider networking was not simulated.

## Packaging gate
The release ZIP must be extracted into a fresh directory and the complete 48-script regression suite plus all 72 syntax checks must pass again before delivery. Browser lifecycle validation must also be repeated against the extracted packaged copy.

## Live-provider limitation
This QA does **not** claim a live Veo, ElevenLabs, Sync Labs, Supabase, Vercel, or deployed-Firefox production run. Those services require the user's deployed credentials/environment. No new paid provider jobs were submitted during QA.

## Final packaged-copy verification
Completed after packaging:
- Extracted-copy `scripts-*.mjs`: **48 / 48 passed**
- Extracted-copy JavaScript/MJS syntax: **72 / 72 passed**
- ZIP integrity: **no compressed-data errors**
- Extracted-copy Chromium media lifecycle harness: **passed**
  - 3 / 3 supplied MP4 players decoded to `readyState=4`
  - invalid primary recovered to a valid scene-specific fallback
  - 0 extra `loadstart` events during unrelated scene update
  - 0 `src` mutations during unrelated scene update
  - 0 player removals/re-parenting during unrelated scene update
  - playback continued across the update
  - clip-end handling caused no remount/source reload
  - all players finished in `media-loaded` state with positive duration
  - 0 browser console/page errors in the harness
