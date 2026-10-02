# CineTale v1.11.0 — Global Story Intelligence / Cost Guardian QA

## Release intent
v1.11.0 is the first product-direction release after v1.10.65. It preserves the existing durable-video, selected-shot, dialogue-sync, identity, recovery and final-assembly code paths while adding a global story-world context layer and production-cost profile.

## Product changes
- Global Story Intelligence fields: region/community, belief context, festival/tradition/occasion, time/place, cultural grounding and language behavior.
- `worldBible.globalContext` persists reusable culture/language/belief/tradition context, respect guardrails and uncertainty notes for future episodes.
- Story-generation prompt explicitly avoids inferring religion/ethnicity/nationality/caste/tribe/political identity from names/appearance and requires uncertainty notes instead of invented ritual/scripture/history.
- Multilingual/code-switching context is persisted across story rebuilds and episode continuation.
- Studio sidebar exposes Global Story Intelligence memory for the active project.
- Production profiles: Economy / Balanced / Cinematic.
- Economy defaults scenes to Veo Lite/draft; Balanced reserves standard motion for speaking/performance scenes and draft for ordinary non-speaking scenes; Cinematic reserves premium for speaking/pivotal scenes and standard elsewhere.
- Cost Guardian contract: story/world editing never triggers paid video generation; durable paid assets remain reuse-first.
- Culture/world context is forwarded to video prompting through the world bible.

## Regression results
- Dedicated v1.11.0 Global Story Intelligence regression: **10/10 passed**.
- All script-level regression/runtime/QA files: **132/132 passed**.
- JavaScript/MJS syntax checks: **156/156 passed**.
- `npm run check`: passed.
- `npm run smoke`: passed.
- `npm run qa:deep`: passed.
- Deep QA inventory: **197 static IDs, 500 DOM refs, 19 API routes, 3 local assets, 320 files**.

## Existing production fixes preserved
The v1.10.65 primary-video provenance recovery, v1.10.64 single-flight speaking-shot sync state, v1.10.63 selected-shot media lifecycle/MIME shield, durable media recovery, duplicate-safe coverage reconciliation, speaker/voice binding, shot isolation and final assembly guard paths remain in the codebase and their regression scripts pass in this build.

## Important live-provider boundary
No paid Veo or lip-sync operation was submitted while building this release. Static/runtime test coverage verifies the application logic and provider request contracts, but live provider behavior still depends on deployed credentials, provider availability/quota and provider-side acceptance. A successful deployment should be followed by one controlled end-to-end production test before treating live-provider behavior as field-proven.
