# CineTale v1.9.75 QA report

## Release objective

This release addresses the live final-video symptoms reported after v1.9.74: repeated video segments, speech/audio arriving late or disappearing, final picture and audio drifting out of synchronization, and the Google chooser exposing the raw Supabase project hostname.

## Root-cause corrections

### Final speaking-media authority

Validated lip-sync output is now the single source of truth for both picture and speech during final assembly. The final renderer no longer starts a second detached cached TTS timeline over a synchronized video. That prior dual-timeline design could drift when browser media startup or decoding was delayed.

Only the validated synchronized primary clip is allowed to contribute source audio. Raw Veo/provider coverage clips remain silent in final assembly.

### WebAudio mute/capture correction

The synchronized primary media element is explicitly unmuted before its `MediaElementAudioSourceNode` is captured. Coverage clips stay muted. This removes a browser-dependent path in which the final recorder could capture picture while receiving no synchronized source audio.

### No repeated generated footage

Final assembly no longer uses modulo looping (`clipIndex % videos.length`) to stretch a scene to the target runtime. Every generated source clip is consumed at most once. If available source coverage is shorter than the requested beat, CineTale renders the real coverage rather than visibly repeating the same clip.

Balanced and Cinematic automatic production now plan more distinct coverage based on the scene's actual beat duration so ordinary target runtimes can be reached with unique footage rather than loops.

### Recorder start stabilization

A short recorder warm-up is inserted before the first synchronized scene starts. Audio and picture still start together; the warm-up only ensures the capture stream/recorder is active before scene playback begins.

### Final player audio state

When a verified final file is mounted or restored, the final player explicitly resets to `muted = false` and volume `1` so stale element state cannot make a valid final file appear silent.

### Google OAuth branding support

`/api/auth-config` now exposes optional `SUPABASE_OAUTH_URL`, and **Continue with Google** uses that branded custom Supabase auth origin when configured. If it is absent, CineTale safely falls back to `SUPABASE_URL`.

See `GOOGLE_OAUTH_BRANDING_SETUP.md`. A custom OAuth/auth domain and Google OAuth application branding are deployment configuration; JavaScript alone cannot rename Google's displayed third-party OAuth origin.

## Preservation / safety rules

- Existing READY scene clips are reused.
- Existing validated lip-sync assets remain authoritative.
- The lip-sync semantic pipeline revision was not changed, so unrelated metadata does not invalidate paid synchronized assets.
- Final render remains fail-closed if a speaking scene lacks a validated synchronized clip.
- Raw provider speech is not admitted into the final mix from coverage clips.
- Cloud final-video persistence from v1.9.74 remains in place.
- Final video browser-local fallback remains in place.
- Project/profile deletion continues to clean account-saved final-video objects.

## Automated verification

Final pre-package run:

- all 40 `scripts-*.mjs` QA/regression scripts: PASS
- JavaScript/MJS syntax validation: PASS
- deep QA: 182 static IDs, 462 DOM references, 19 API routes, local-asset checks, duplicate-ID checks: PASS
- v1.9.75-specific no-repeat/synchronized-audio/OAuth-branding regression: PASS
- scene audio regression: PASS
- voice-mix regression: PASS
- lip-sync regression/adoption/status recovery: PASS
- player lifecycle regression: PASS
- Preview Sequence regression: PASS
- final-render sync gate/stable-player regression: PASS
- final-progress stability regression: PASS
- one-click final UX regression: PASS
- cloud final-video persistence regression: PASS
- video MIME/range regression: PASS
- character voice continuity regression: PASS
- smoke suite including auth/cloud, Story/Short/Movie/Episode flows, quota handling, no-crop media, consent, final assembly, voice filtering and navigation: PASS

## What was not claimed as live-tested

This environment cannot reproduce the user's exact deployed Vercel + Firefox session or consume the user's live Veo, ElevenLabs, Sync Labs, Supabase, and Google OAuth configuration. Provider API paths are covered by the existing mocked/regression tests, but a deployed browser validation remains necessary before calling the release field-verified.

For the first v1.9.75 deployment test, reuse existing READY / synchronized assets where possible. Do not regenerate paid scenes merely to test final assembly. A final file created by an older pipeline should be rebuilt once from the preserved scene assets so it uses pipeline version 9.
