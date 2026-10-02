# CineTale v1.10.47 — System Integrity & Persisted Identity Reconciliation RC

## Scope
This release is a system-level reliability pass focused on persisted project migration, multilingual/cross-script character identity, dialogue-to-shot ownership, voice/lip-sync identity binding, production preflight, and fail-closed protection of durable paid media.

## Key changes
- Added deterministic migration of stale/legacy dialogue and shot identity references when an existing project is loaded.
- Dialogue speaker text is used as the authoritative recovery signal when legacy stored IDs conflict and no paid media exists.
- Stable IDs remain authoritative during normal post-migration production behavior.
- Added stronger cross-script/title normalization and score-based alias matching without guessing on collisions.
- New generated characters request `canonicalName` and `aliases[]` so future multilingual stories have stable identity anchors from creation time.
- Scene recovery rewrites speaking-shot `speaker`, `spokenLine`, `dialogueTurnIndex`, and `dialogueCharacterId` together before media generation.
- Ambiguous identity matches remain fail-closed.
- Existing durable/generated media is not silently reassigned or reshuffled.
- Episode-level production logic preflight still blocks automatic/final generation when any scene is unresolved.

## Source-tree validation
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Regression/runtime scripts: 110/110 PASS
- JavaScript/MJS syntax validation: 137/137 PASS
- Deep QA inventory: 188 static IDs, 475 DOM references, 19 API routes, 274 files checked
- Dedicated persisted multilingual identity migration regression: PASS
- Existing system-integrity regression: PASS
- Existing voice-continuity regression: PASS

## Provider/browser verification boundary
No fresh billable Veo, image-generation, ElevenLabs, or lip-sync production call was made as part of packaging QA. Browser/provider behavior that requires a live paid request is therefore not claimed as newly verified. The next deployed check should first reopen the existing Kailash project and confirm Scene 2 migrates from **Plan needs attention** to **Plan verified** before any generation credits are used.
