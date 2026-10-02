# CineTale v1.10.48 QA Report

## Release
**CineTale v1.10.48 — Authoritative Identity Graph & Customer-Safe Repair RC**

## Root-cause addressed
The persisted-project failure could survive v1.10.47 because legacy/stale identity metadata was allowed to participate in a consensus with the current shot/dialogue speaker. A stale binding could therefore prevent an otherwise unique current cast match from repairing itself.

v1.10.48 changes the identity-repair precedence for ungenerated plans:
1. explicit current dialogue speaker, when present;
2. current speaking-shot owner;
3. only then legacy bindings, stored IDs and fallback aliases.

A stale stored ID or obsolete binding can no longer veto a unique authoritative current speaker match. Explicit dialogue ownership remains higher priority than a conflicting shot label. Ambiguous current identities still fail closed.

## System-level safeguards retained
- immutable cast IDs remain the production ownership key;
- multilingual/sacred aliases remain supported;
- story dialogue, shot owner, voice, Listen, lip-sync and final timeline are reconciled to the same character identity;
- durable/paid media is never silently reassigned;
- deterministic repairs occur only before shot media exists;
- ambiguous cases stop before billable generation;
- project normalization runs on load/save and production preflight;
- episode/final production logic gates remain in place.

## New regression coverage
`scripts-v11048-authoritative-identity-repair-regression.mjs` executes the actual resolver helper code and verifies:
- Hindi Bal Kartikeya resolves despite stale legacy IDs and conflicting stale fallback labels;
- an explicit Hindi dialogue speaker overrides an incorrect shot label;
- Skanda resolves to Kartikeya;
- Uma resolves to Parvati.

## Source-tree validation
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- regression/runtime scripts: **111/111 PASS**
- JavaScript/MJS syntax validation: **138/138 PASS**
- deep QA: **188 static IDs, 475 DOM references, 19 API routes, 276 files checked**

## Live-provider limitation
Packaging QA did not intentionally execute fresh billable Veo, ElevenLabs, image-generation, or lip-sync production jobs. Existing provider-route/mocked/deep QA checks passed, but live billable provider behavior is not claimed as newly verified by this packaging run.

## Required deployed regression test
Reopen the existing Hindi Kailash project. Scene 2 should be re-evaluated using the current shot/dialogue ownership rather than stale identity metadata. If no paid media exists and the current shot owner uniquely resolves to the locked cast, the plan should self-repair to **Plan verified** without repeated manual troubleshooting.
