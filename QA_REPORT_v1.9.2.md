# CineTale Studio v1.9.2 QA Report

## Scope
This build starts from the delivered v1.9.1 Video-429-Resilience baseline and adds creator-controlled character portrait setup without changing the story-review gate or video resilience behavior.

## Portrait workflow changes
- `Generate portrait` and `Regenerate` now open a Portrait Setup modal before any image request is submitted.
- The modal exposes project style, Photorealistic/Cinematic, 3D Animated, 2D Animated, Illustrated/Storybook, Anime, Watercolor, Graphic Novel, Clay/Stop-motion, Devotional Art, Sacred Cinematic, and Custom style.
- Inferred appearance and cultural/background context are editable before generation.
- Custom style requires a description before generation.
- Existing portraits use `Generate alternative` and, when identity lock/reference conditions permit, pass the current portrait back as the identity reference.
- Successful generation persists the confirmed appearance/background/style and keeps Identity Lock enabled.
- Sacred/mythological characters retain the existing sacred/canonical prompt layer and receive an explanatory notice in Portrait Setup.
- `Generate all portraits` now asks for confirmation, makes quota use explicit, and generates only missing portraits when some characters already have portraits. It regenerates all only when no portraits are missing.

## Automated validation
- `node --check` on every `.js` and `.mjs`: PASS
- API/lib module import check: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Deep QA result: 173 static IDs, 403 DOM references, 12 API routes, 3 local assets, 34 files checked.
- Regression assertions added for Portrait Setup modal, style selector, editable appearance/background, alternative-generation path, quota copy, and responsive portrait modal CSS.
- Existing simulated image quota/request failures and ElevenLabs fallback checks remain passing. Their warning output is expected test instrumentation, not a failed QA result.

## Existing protections retained
- Full-story review and approval gate before paid production.
- Character identity continuity and reference-portrait handling.
- Storyboard, narration, voice selection/filtering, scene video, Veo 429 backoff/fallback, final assembly and final rendering paths covered by the existing smoke suite.
- No merge markers; JSON/package validation remains green.

## Live-provider limitation
Automated QA does not spend the owner's live Gemini/ElevenLabs/Veo quota. A deployed live portrait request still depends on configured provider keys, model availability and current provider quota. The UI change itself is locally validated; after deployment, test one portrait before using Generate all portraits.
