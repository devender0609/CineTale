# CineTale v1.10.5 QA Report — Clean Scene-Video Workflow

## Goal
Remove the confusing `Visual ready` message surface from existing video clips and make Generate/Regenerate clip a one-step production workflow rather than a source-generation step followed by a separate Finish clip action.

## Changes verified
- Existing scene source media renders as the actual `<video>` surface with no `Visual ready` / `Finish dialogue` copy inside the frame.
- Unfinished speaking source media remains visual-only (`muted`, sync-gated) until a validated synchronized AV exists; raw/provider speech is not treated as authoritative audio.
- Idle `Visual ready · finish dialogue…` status text is removed.
- The normal scene action no longer labels an action `Finish clip`.
- Generate/Regenerate video automatically continues through durable source persistence and approved-dialogue synchronization.
- Valid existing unfinished sources use Complete clip / Retry clip without another Veo generation.
- Synchronization failures during Generate/Regenerate repaint the affected scene and preserve its source for retry.
- Scene-local updates remain isolated; other scene players are not globally remounted.

## Source-tree validation
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- all JS/MJS syntax checks: PASS
- regression scripts: 65/65 PASS
- deep QA: 182 static IDs, 462 DOM references, 19 API routes, 3 local assets, 184 files

## Live verification boundary
No paid live video/lip-sync generation was initiated in this environment. Browser/provider acceptance must still be verified on the deployed Vercel build. The required live behavior is: Regenerate clip once -> source generation -> durable persistence -> approved dialogue sync -> one finished playable AV, without exposing a `Visual ready` card or requiring a second Finish clip click.
