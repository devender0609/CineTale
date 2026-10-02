# CineTale v1.10.52 — Mixed-Script Identity Recovery & Canonical Dialogue Migration RC

## Root cause reproduced from the exported workspace
The saved Kailash project contained a mixed-script typo in Scene 2: `बाल कार्तिकेy` (Latin `y`) while the locked cast identity is `बाल कार्तिकेय` (Devanagari `य`). The prior resolver required a stronger exact/alias match, so the first dialogue binding stayed unresolved and the production plan remained blocked.

The exported project showed:
- Scene 2 dialogue turn 1 speaker: `बाल कार्तिकेy`
- Scene 2 shot 2 speaker: `बाल कार्तिकेy`
- Scene 2 shot 2 `dialogueCharacterId`: empty
- Scene 2 binding status: `missing / no-consensus-match`
- Locked character: `bal-kartikeya` / `बाल कार्तिकेय`

## Fix
1. Added conservative one-character identity typo tolerance for unique names of sufficient length.
2. After a unique identity is resolved, ungenerated scene dialogue speaker labels are rewritten to the locked canonical character name.
3. Dialogue bindings and speaking-shot ownership are then rebuilt from the canonical identity.
4. Already-produced media remains protected from this metadata rewrite.
5. Identity migration revision and production logic revision advanced to v1.10.52.

## Exact real-workspace validation
The actual user-exported workspace JSON was loaded into the v1.10.52 migration code during QA.

Before migration:
- `बाल कार्तिकेy`
- unresolved binding
- empty shot `dialogueCharacterId`

After migration:
- `बाल कार्तिकेय`
- binding `bal-kartikeya`
- shot speaker `बाल कार्तिकेय`
- shot `dialogueCharacterId = bal-kartikeya`
- `identityMigrationUnresolved = []`
- Scene 2 production logic audit: PASS, 0 issues, 2 dialogue turns / 2 speaking shots

## Source validation
- 118/118 regression/runtime/QA scripts passed
- 142/142 JavaScript/MJS syntax checks passed
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Deep QA: 188 static IDs, 475 DOM refs, 19 API routes, 3 local assets, 290 files checked

## Provider caveat
Deep QA encountered the known live-provider test conditions: Gemini quota exhaustion / unsupported image delivery route and an ElevenLabs model fallback. No fresh billable Veo, image, TTS, or lip-sync production was claimed as verified for this packaging pass.

## Exact packaged ZIP validation
After packaging, the ZIP was extracted into a clean directory and the same validation was repeated against the exact delivered artifact:
- 118/118 regression/runtime/QA scripts passed
- 142/142 JavaScript/MJS syntax checks passed
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- exact package deep QA: 188 static IDs, 475 DOM refs, 19 API routes, 3 local assets, 288 files checked
