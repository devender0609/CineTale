# CineTale v1.10.46 — System Integrity & Multilingual Identity RC

## Scope
This release is a system-level integrity pass, not a one-story patch. It strengthens canonical character identity, multilingual/sacred alias resolution, dialogue/shot/voice ownership, project-wide production preflight, paid-media fail-closed behavior, and creator-facing shot-plan localization.

## Root-cause changes
- Stable character IDs remain authoritative everywhere; display names and aliases are only resolution aids.
- Added Unicode-safe identity normalization that preserves combining marks used by Indic and other scripts.
- Added deterministic multilingual identity alias resolution across canonical names, display names, aliases, roles, sacred/canonical labels, and selected sacred-figure name families.
- Ambiguous alias matches fail closed rather than guessing.
- Dialogue bindings now persist both canonical cast ownership and the source speaker label.
- Ungenerated speaking shots are reconciled to the authoritative dialogue turn, canonical character ID, canonical character name, and spoken line before generation.
- Scene self-healing now re-runs identity reconciliation after production-logic repair.
- Episode/project preflight now also checks duplicate character IDs/names, duplicate scene IDs, unresolved/ambiguous speaking identities, and durable shot media orphaned from the current shot plan.
- Durable/paid media remains protected: identity or shot ownership is never silently reassigned after produced media exists.
- Hindi shot-plan cards now use localized visual shot labels for the prominent card title instead of showing English `Movement`/`Establishing` as the primary visual label.
- Manual shot generation, automatic scene production, and one-click final production remain behind the same production-logic gates.

## New regression coverage
- Hindi and English aliases for Bal Ganesha, Bal Kartikeya/Skanda, and Mata Parvati/Uma resolve to the same locked identities.
- Stable character ID outranks any display-label variation.
- Duplicate aliases fail closed as ambiguous.
- Unknown speakers are not guessed.
- Dialogue/shot ownership self-heals before media generation.
- Existing durable media prevents silent rebinding.
- Existing character-ID voice continuity remains intact, including preserved binding timestamps.

## Source validation
- 111/111 regression/runtime scripts passed.
- 135/135 JavaScript/MJS files passed `node --check`.
- `npm run check` passed.
- `npm run smoke` passed.
- `npm run qa:deep` passed.
- Deep QA: 188 static IDs, 475 DOM references, 19 API routes, 3 local assets, 271 files checked.

## Live-provider limitation
No new billable Veo, ElevenLabs, image-generation, or lip-sync job was intentionally submitted during packaging QA. Provider behavior, browser autoplay policies, and deployed Vercel networking still require a live deployed-browser verification.

## Exact-artifact release contract
The final ZIP is extracted into a clean directory and the complete 111-script regression set, syntax validation, `check`, `smoke`, and `qa:deep` are rerun on the exact packaged artifact before delivery.
