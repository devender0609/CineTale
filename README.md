
## v1.11.0 — Global Story Intelligence + Cost Guardian

CineTale now treats culture, belief context, traditions, festivals, languages, region/community, time/place and multilingual behavior as persistent story-world memory rather than decorative prompt text. The Studio surfaces this context and future episodes receive the same world memory. Production profiles (Economy, Balanced, Cinematic) use existing Veo quality tiers to reduce generation cost while keeping paid generation explicit and reuse-first.
# CineTale v1.10.39 — App-Wide Shot Context & Release Audit RC

This release turns selected-shot behavior into a global production contract. Every selected shot now drives the visible dialogue, speaker, locked voice card, Listen target, generation/completion action, and performance context across all scenes and future episodes. Visual shots truthfully show no dialogue while retaining scene-level voice access without mislabeling the shot speaker. The performance editor surfaces the currently selected shot so editing cannot silently target stale context.

The release gate is app-wide rather than screenshot-specific: syntax/check, smoke, deep QA, all API/lib syntax, duplicate-function audit, the full carry-forward regression suite, selected-shot context regression, app-wide navigation/media/final-assembly audit, ZIP integrity, and a second full run from the exact extracted ZIP. Existing durable paid media remains protected. Live Vercel/browser/provider acceptance is not claimed by offline QA; Chromium runtime execution was attempted in the container but the container browser/DBus environment did not complete, so deployed-browser verification remains required.

## v1.10.8 — Authoritative player audio state

- Fixed the synchronized-player DOM marker mismatch (`data-lip-sync-ready` ↔ `dataset.lipSyncReady`).
- Finished playback now derives audibility from live validated scene state plus the mounted `currentSrc`, not a stale DOM marker alone.
- When the mounted player is the authoritative synchronized asset, CineTale removes any stale sync gate/mute state, sets `defaultMuted=false`, `muted=false`, and `volume=1`.
- Recovery and adoption paths now also clear stale sync-gate state before exposing embedded dialogue audio.

# CineTale Studio

## v1.10.6 — Authoritative synchronized-audio adoption

- Source-video provenance is now validated against the exact shot identity persisted with the generated source (`videoPrimaryShotId`, speaker, spoken line and timing), not a freshly re-selected coverage-plan primary shot.
- This prevents a correct synchronized result from being falsely rejected after coverage-plan drift and then rendered as a permanently muted source preview.
- Finished speaking playback remains fail-closed: only a validated, durably owned synchronized AV becomes the unmuted authoritative player. Raw/source provider audio is never promoted merely because an MP4 contains an audio stream.
- Generate/Regenerate continues through dialogue synchronization; a completed synchronized asset must become the scene authority or the scene remains explicitly incomplete.

> Historical notes below are retained for release history. Where they conflict with v1.10.6, the v1.10.6 contract above is authoritative.

## v1.10.5 — Clean scene-video workflow

Scene cards no longer replace an existing source video with a black **Visual ready** message surface. When CineTale owns a source video, the actual video remains visible; unfinished speaking sources are visual-only until the approved synchronized AV is validated, and all production state stays outside the video frame.

The normal scene action no longer exposes **Finish clip**. **Generate video clip** and **Regenerate clip** are full production actions: generate/re-generate the source, persist it durably, create/use the approved dialogue, run synchronization, persist and validate the synchronized AV, and then leave the scene in its finished playable state. Existing valid but unfinished sources use **Complete clip** or **Retry clip** as recovery actions without spending another Veo generation.

A regenerate action that reaches dialogue synchronization now propagates synchronization errors and repaints the same scene card with a persistent recovery state instead of silently stopping halfway. The source video remains available and visible for retry.

Release gate: source and exact packaged-copy syntax/check/smoke/deep QA plus the complete regression suite must pass. Live Vercel/provider acceptance remains a separate deployment gate.

> Historical notes below are retained for release history. Where they conflict with v1.10.5, the v1.10.5 contract above is authoritative.

# CineTale

## v1.10.4 — Owned-source lip-sync transport

CineTale no longer falls back from an owned durable source video to a provider-fetched URL merely because the source exceeds Sync Labs’ direct multipart limit. It retrieves the owned source, uses direct multipart below 20 MB, and otherwise uploads the source through Sync Labs Assets and submits the returned assetId. If CineTale cannot retrieve its owned source, Finish clip fails explicitly instead of disguising that failure as a remote-provider URL problem. The synchronized output still must be downloaded, durably persisted, verified, and provenance-validated before READY.

Release gate: source and exact packaged-copy syntax/check/smoke/deep QA plus the complete regression suite and v1.10.4 transport regression must pass. Live Vercel/provider playback remains a separate deployment acceptance gate.

> Historical notes below are retained for release history. Where they conflict with v1.10.4, the v1.10.4 contract above is authoritative.

# CineTale Studio

## v1.10.4 — Finish clip action hardening

The speaking-scene Finish clip workflow is now a dedicated production action rather than an overloaded Generate video path. A user-triggered finish cannot silently swallow TTS, identity, configuration, provider, persistence, or lip-sync errors: the scene persists a visible preparing/processing/error state and surfaces the concrete failure reason. Synchronization is bound to the exact speaking-shot identity stored with the owned source video before any fallback to the current coverage plan. Scene video actions are bound directly during Studio rendering rather than relying on the former pointerdown delegation path.

The production contract remains unchanged: unfinished speaking visuals are not presented as finished playable movies; successful speaking clips use one durable synchronized AV asset with embedded approved dialogue; source video is preserved on failure; provider credits are not spent to regenerate a valid owned source unnecessarily.

Release gate: all regression scripts, JS/API/lib syntax checks, smoke QA, deep QA, and the v1.10.4 Finish clip regression must pass in source and again from the exact extracted ZIP. Live Vercel/browser/provider acceptance remains a separate deployment gate.

> Historical notes below are retained for release history. Where they conflict with v1.10.4, the v1.10.4 contract above is authoritative.

## v1.10.0 — Production media contract + exhaustive release-candidate hardening

This release makes the speaking-scene contract unambiguous: an unfinished speaking source is **not** shown as a silent movie player. CineTale preserves the durable source internally and shows a still **Visual ready** preview until dialogue synchronization is complete. Only a durably owned, strictly validated synchronized AV file becomes the normal `<video controls>` player. That finished player uses its own embedded approved dialogue audio; CineTale does not layer a detached production TTS track over it.

A validated synchronized asset can no longer silently fall back to source/coverage footage when playback fails. Recovery first rehydrates CineTale-owned media, normalizes MP4-family MIME metadata when needed, and preserves source ownership during sync-only integrity repair. Final preview, duplicate-content validation and final rendering now rehydrate durable media rather than depending on temporary provider URLs. Normal creator health UI is capability-level; provider/model diagnostics and live verification controls are owner-only.

Release gate: all regression scripts, JS/API/lib syntax checks, smoke QA, deep QA, and the v1.10.0 production-contract audit must pass in source and again from the exact extracted ZIP. Live browser/provider acceptance is a separate deployment gate and must not be claimed unless actually run.

> Historical notes below describe earlier behavior and are retained only for release history. Where they conflict with v1.10.0, the v1.10.0 contract above is authoritative.

## v1.9.92 — Clickable visual preview + finished audible speaking clip

Unfinished speaking sources remain muted visual previews until approved voice lip-sync is complete, but the preview is now fully clickable/tappable and keyboard-operable for play/pause. `Finish clip` still reuses the durable source and creates the authoritative audible synchronized MP4. Visible video surfaces must never disable pointer interaction.

Speaking scenes now have two explicit internal states without exposing technical provider language to normal users. A durable source shot can remain visually present while dialogue is unfinished, but it is not exposed as a normal native video player with a misleading mute/volume control. If CineTale already owns that source, the scene action becomes **Finish clip** and reuses the existing video for exact approved-voice lip-sync instead of spending another Veo generation. Only the durably stored, strictly validated synchronized MP4 becomes the normal audible/controllable speaking clip. **Listen** remains an independent voice preview and never removes the existing visual.

## v1.9.88 — Transactional owned scene media

A provider URL is no longer a READY asset. CineTale now downloads and validates each primary scene video, synchronized speaking video, and generated coverage shot before adopting it. Guest projects require a verified IndexedDB copy; signed-in projects also upload to the existing private Supabase Storage bucket and reopen the stored object before READY. Visible Studio players use only hydrated durable media, so expired legacy provider URLs are not mounted directly. Existing dead legacy URLs cannot be reconstructed and may require one regeneration; still-live legacy media is imported off-screen before use. No new SQL migration is required if `SUPABASE_FINAL_VIDEO_STORAGE_SETUP.sql` has already been run.

# CineTale v1.9.85 — Professional timed-shot media foundation

This release changes CineTale's media behavior toward the product goal: one story can become a polished story, audio experience, short, episode or movie without pretending that an unsynchronized source clip is a finished performance.

## v1.9.85 native scene-player visibility fix

- Removed the custom black/poster overlay that could visually cover native video controls indefinitely while `preload="metadata"` waited for a decoded frame.
- Scene videos now use the browser-native `poster` attribute and expose the actual `<video controls>` surface immediately.
- Preserves the v1.9.84 no-remount/no-flicker lifecycle and scene-local media recovery.

## v1.9.85 release changes

- Scenes now receive an explicit timed shot plan (`startSec`, `endSec`, `durationSec`) whose shots cover the full story beat without modulo-looping a short clip.
- Dialogue turns preserve speaker and line order in the shot plan; each planned speaking turn is tied to its exact speaker/text.
- Veo duration selection now follows the planned shot duration and maps to supported 4/6/8-second generation windows.
- Unsynchronized source video is visual review only. The player never layers detached browser-timed TTS over unrelated mouth motion. Use **Listen** to review the approved voice; finished speaking playback comes only from a validated synchronized clip.
- Playable video surfaces carry no technical/status badge such as “Source preview + approved voice.” Technical/provider details stay outside the movie frame or in owner diagnostics.
- Video `ended` no longer hot-swaps sources or remounts Studio, eliminating a major flicker path.
- Completion of one provider video job patches only that scene's media element instead of rebuilding every scene card.
- Final assembly orders unique media by the timed shot plan, uses each clip at most once, and admits embedded speech only from the validated synchronized timeline entry.
- ElevenLabs v3 no longer receives generic performance tags on every natural line; strong audio tags are reserved for clearly requested emotional directions to reduce over-directed delivery.
- No database/SQL migration is required beyond the existing one-time final-video storage setup introduced earlier.

The release gate includes the full carry-forward regression suite plus `scripts-v1981-professional-timeline-regression.mjs`, syntax validation, ZIP integrity, and a second run against the extracted package. Live Vercel/Firefox/provider behavior still requires deployment verification and is never claimed when it was not actually run.

## v1.9.75 final-video persistence setup

CineTale v1.9.75 keeps the browser final-video copy and can also persist signed-in creators' final videos in private Supabase Storage. Run `SUPABASE_FINAL_VIDEO_STORAGE_SETUP.sql` once in the same Supabase project used by CineTale Auth. The bucket is private and RLS limits each signed-in user to their own UID folder.

If the bucket is not installed, final rendering still completes and the app keeps the browser-local copy, but the UI will accurately identify it as browser-only persistence.


## v1.9.76 media integrity

Final rendering now treats each validated synchronized speaking clip as an atomic picture+audio unit, does not pad it with silent coverage, detects duplicate source/synchronized media across different scenes (including content fingerprints when accessible), repairs only the later duplicate scene during one-click production, and binds background video polling to the project/episode that started the job. Existing valid synchronized assets keep the same lip-sync semantic revision.

## v1.9.85 scene-audio provenance and safe recovery

- A synchronized scene is no longer trusted merely because its saved MP4 is playable. CineTale now preserves the exact scene semantic signature and a SHA-256 fingerprint of the approved audio submitted for lip-sync.
- Legacy synchronized assets that an older build marked as “recovered” without proving dialogue compatibility are intentionally blocked from READY and rebuilt only when final production actually needs them. This prevents stale dialogue from being silently attached to the current scene.
- Lip-sync polling is bound to the immutable scene ID as well as project/episode identity, preventing a long-running provider result from being written into a different scene slot after state changes.
- A scene-dialogue mutation check stops a synchronization request if the words/voice bindings change while approved audio is being prepared.
- Provider submission recovery now uses a SHA-256 scene+audio request digest where supported, reducing the chance of a stale/ambiguous provider generation being recovered for another request.
- The Studio explicitly shows “Dialogue sync must be rebuilt” for unsafe legacy recovered assets instead of displaying a false READY state.
- v1.9.76 duplicate-media detection, atomic synchronized final assembly, no-repeat final coverage, and account final-video persistence are retained.

## v1.9.85 approved-audio review and resilient scene media
- Unsynchronized speaking previews stay clickable and use approved CineTale dialogue while raw provider/source audio stays muted.
- Broken saved primary/sync media can fall back to another saved coverage clip for the same scene.
- Unavailable media is surfaced as needing repair instead of being presented as healthy.
- Speaking scenes still require validated lip-sync before final assembly.
