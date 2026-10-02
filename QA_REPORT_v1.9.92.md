# CineTale v1.9.92 QA Report

## Release focus
v1.9.91 intentionally disabled pointer interaction on unfinished speaking-source previews. That made a visible video appear broken/non-clickable. v1.9.92 keeps the source preview muted until approved voice lip-sync is complete, but restores direct click/tap/keyboard play-pause interaction. `Finish clip` still reuses the durable source and produces the authoritative audible synchronized MP4.

## Fixes
- Removed `pointer-events:none` from unfinished speaking video previews.
- Visible preview video now accepts pointer interaction and uses a pointer cursor.
- Added click/tap play-pause behavior for unfinished speaking-source previews.
- Added Enter/Space keyboard play-pause behavior and accessible button semantics.
- Preserved hard mute for unfinished source previews so raw/provider speech cannot leak.
- Preserved `Finish clip` flow: reuse durable source -> exact approved voice -> strict lip-sync -> durable synchronized MP4 -> normal controllable audible player.
- Preserved scene identity, durability, no-cross-scene-remount, and final-output gates from prior releases.

## Validation
Working-source release gate:
- 56/56 regression, smoke, deep-QA, and targeted scripts passed.
- 80/80 JavaScript/MJS files passed `node --check` syntax validation.

A dedicated v1.9.92 regression verifies that the visible unfinished preview can never disable pointer events and must expose play/pause interaction.

## Live-provider limitation
No paid Veo, ElevenLabs, or lip-sync request was triggered during this validation. The code and packaged artifact are verified locally; exact deployed-provider/browser behavior still requires the live Vercel test.
