# CineTale v1.9.58 QA Report

## Scope
Responsive scene-player sizing correction after live v1.9.57 verification showed the player still looked too small in a split-window/narrow desktop layout. The root cause was not the video element itself; it was the scene-card grid capping the entire media column at about 150–210 px at <=900 px viewport widths.

## Fix
- At viewport widths <=1050 px, scene cards now stack the scene media above the text/actions so the 16:9 video uses the full card width.
- At 1051–1280 px, the media column is enlarged to 46% with a 320 px minimum.
- Video remains 16:9, edge-to-edge inside its allocated media surface, with `object-fit: contain`; no cropping or stretching is introduced.
- Sync Labs pipeline revision, synchronized-asset identity, provider settings, audio authority, job recovery, and final-assembly logic are unchanged. Existing paid synchronized assets are not invalidated.

## Validation
- Existing full CineTale release gate retained.
- New v1.9.58 regression verifies cache/version busting, full-width stacked scene media at <=1050 px, enlarged mid-width media column, and no-crop behavior.
- No live provider generation is required for this UI-only release.
