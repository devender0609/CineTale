# CineTale Studio v1.10.62 QA Report

## Release focus

v1.10.62 combines the v1.10.61 shot-switch media decode shield with provider-policy-safe video prompting and explicit video safety-filter classification.

### Fixed: transient native video/MIME message during shot switching
- Durable scene/coverage media is not remounted from stale provider URLs while local/cloud media hydration is still in progress.
- The player remains behind a CineTale decode/loading shield until the browser has decoded playable media.
- Browser-native unsupported-format/MIME errors are not exposed during source replacement or recovery.
- The same protection applies to source video and synchronized media.

### Fixed: completed Veo job filtered for real-person / celebrity likeness
- Video prompts now contain an explicit identity-safety contract requiring wholly original synthetic faces.
- Sacred/mythological identities are explicitly described as traditional story identities, not portrayals of actors, celebrities, public figures, or other real people.
- “Photorealistic live-action” style wording is normalized for Veo to cinematic realism/fantasy while preserving believable lighting, materials, anatomy, movement, wardrobe, culture, and scene continuity.
- A creator-authorized personal reference, when explicitly present, remains distinguished from celebrity/public-figure likeness requests.
- Provider filter responses mentioning real people, celebrities, public figures, or likenesses are classified as `VIDEO_REAL_PERSON_LIKENESS_FILTER` instead of the misleading generic `VIDEO_ASSET_MISSING`.
- The client returns the shot to a safe manual-retry state and tells the creator that the next retry uses a safer original-character prompt.
- Generic provider media filters are classified separately as `VIDEO_PROVIDER_POLICY_FILTER` and are never auto-retried.
- Existing successful media is preserved; no automatic paid replacement job is started.

## Validation

Source-tree validation:
- 128/128 script-level regression/runtime/QA checks passed (125 regression/runtime scripts plus `check`, `smoke`, and `qa:deep`).
- 152/152 JavaScript/MJS syntax checks passed.
- `npm run check` passed.
- `npm run smoke` passed.
- `npm run qa:deep` passed.
- Deep QA inspected 188 static IDs, 475 DOM references, 19 API routes, 3 local assets, and 310 files.
- New v1.10.62 provider-policy-safe prompt regression passed.
- v1.10.61 repeated shot-switch media stability regression remains passing after the new changes.

## Live-provider limitation

No additional paid Veo generation job was submitted solely for release QA. The real-person/celebrity filter response observed in the browser was reproduced with a synthetic provider response, and the prompt, status classification, client failure handling, persistence protections, and retry semantics are covered by regression tests. A live manual retry after deployment is still required to confirm the provider accepts the safer prompt for that exact Shot 2.
