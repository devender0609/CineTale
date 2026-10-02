# CineTale v1.12.1 QA Report

## Release focus
Canon Integrity + Cultural Grounding + Hybrid Cost Routing.

## Product changes verified
- Belief/religion context is durable only when explicitly supplied by the creator; a festival, surname, place or language does not create an inferred belief identity.
- World memory separates invented story canon from grounded real-world context.
- Low-value uncertainty warnings about fictional commercial registries/businesses are filtered from creator-facing continuity review.
- Character aliases remain available for prose, while production-facing dialogue/shot speaker labels are required to use the canonical production identity.
- Bilingual project/episode titles render with a primary title and smaller secondary title instead of one oversized mixed-language block.
- Economy/Balanced/Cinematic planning now assigns hybrid shot routes: animated-art, economy-video, standard-video or premium-video.
- Balanced planning no longer presents every planned story beat as paid video by default; the Smart Production Plan separates art-motion recommendations from paid-video routes.
- Shot-plan cards expose the intended production route before paid production.
- Create flow remains idea-first: one sentence can be expanded into the complete story. Voice input is integrated into the idea box rather than floating below it.
- World & Culture and Cast & continuity Optional controls share one aligned right-column geometry.
- Existing durable media remains reuse/recovery-first; no paid generation is submitted merely by planning or editing.

## Automated validation
- Regression/runtime/QA scripts: 136/136 passed.
- v1.12.1 dedicated Canon + Cultural Grounding + Hybrid Routing regression: 15/15 passed.
- JavaScript/MJS syntax validation: 160/160 files passed `node --check`.
- `npm run check`: passed.
- `npm run smoke`: passed. (The smoke script's historic console title still says v1.10.20.)
- `npm run qa:deep`: passed.
- Deep QA before packaging: 206 static IDs, 504 DOM references, 19 API routes, 3 local assets.

## Live-provider scope
No intentional paid Veo or lip-sync generation was submitted for this release. Smoke/deep QA exercises provider error/fallback logic with controlled test paths; production success against live paid providers still requires one controlled deployed test.

## Release principle
This build keeps CineTale's cost-safety rule: preserve/recover existing paid assets first, distinguish planning from production, and make expensive motion an explicit creator action.
