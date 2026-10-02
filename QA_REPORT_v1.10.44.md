# CineTale v1.10.44 — Production Logic Integrity RC

## Scope
This release adds a production-logic integrity layer so future stories are checked automatically before billable video or dialogue-sync work is submitted. It is designed to prevent speaker/dialogue ownership mismatches and other shot-plan logic defects from propagating into media generation.

## New integrity rules
- Scene dialogue is authoritative for speaking-shot ownership.
- Speaking shots are deterministically rebound to scene dialogue turns in order before media exists.
- The speaking-shot count must exactly match the number of dialogue turns.
- A speaking shot's speaker and spoken line must match the authoritative dialogue turn.
- Nested/conflicting speaker labels inside a spoken line are rejected.
- Visual-only shots may not carry character dialogue ownership metadata.
- Duplicate shot IDs/orders, overlapping timelines, and exact duplicate visual beats are detected.
- Speaking characters must resolve to a real project character identity before generation.
- Manual shot generation, automatic shot generation, and one-click final production all run the same integrity gate before provider submission.
- Fresh ungenerated plans are auto-repaired when the correction is unambiguous. Existing paid/durable media is never silently reshuffled; ambiguous conflicts fail closed instead.
- The Studio shot plan displays a Plan verified / Plan needs attention badge.
- Hindi projects display localized shot-type labels in the shot cards.

## Source validation
- 109/109 regression and runtime scripts passed.
- 133/133 JavaScript / MJS files passed `node --check`.
- `npm run check` passed.
- `npm run smoke` passed.
- `npm run qa:deep` passed.
- Deep QA: 188 static IDs, 475 DOM references, 19 API routes, 3 local assets, 267 files checked.

## Live-provider limitation
No new billable Veo, ElevenLabs, image-generation, or lip-sync production was intentionally performed for this packaging gate. Smoke tests exercise mocked/fallback provider behavior; deployed provider behavior still requires a live browser test.

## Release contract
The release must also pass the same full validation after the exact ZIP is extracted into a clean directory. See final assistant delivery for exact-artifact results.
