# CineTale Studio v1.9.3 QA Report

## Scope
Focused reliability release for video composition after live testing showed Veo clips cropping principal faces/characters too aggressively.

## Changes validated
- Added per-scene **Framing** selector: Safe framing (default), Auto, Medium shot, Close-up, Wide shot.
- Existing scenes with no framing value default to **Safe framing**.
- Veo prompt now preserves storyboard composition and adds explicit face/headroom/side-margin protections.
- Safe framing asks for balanced medium/medium-wide composition and keeps multiple principal characters visually legible.
- Close-up allows intentional body crop but protects the complete face/forehead/chin.
- Wide shot prioritizes environment while keeping principal characters recognizable.
- Important hands and story-critical props are protected when part of the action.
- Unintended zoom drift, edge clipping, and tighter-than-storyboard cropping are explicitly discouraged.
- v1.9.2 portrait setup and v1.9.1 quota-aware video fallback/backoff remain intact.

## Automated validation
- `node --check app.js`: PASS
- `node --check api/video-job.js`: PASS
- Safe-framing prompt runtime assertions: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Deep QA: 173 static IDs, 403 DOM refs, 12 API routes, 3 local assets, 35 files checked.

## Expected test behavior
For a normal story scene, Framing defaults to **Safe framing**. The creator can override it per scene before generating/regenerating a video clip. Previously rendered clips do not change automatically; they must be regenerated if the creator wants the new framing instructions applied.

## Provider limitation
Framing is prompt-directed rather than a guaranteed pixel crop lock. Veo may still vary composition during motion generation, but v1.9.3 gives it substantially stronger composition constraints and creator control. Live provider availability/quota remains external to CineTale.
