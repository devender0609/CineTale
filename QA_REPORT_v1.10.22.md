# CineTale v1.10.22 QA Report

## Release focus
Deterministic story-timeline final assembly. This release protects the validated synchronized-scene pipeline from v1.10.19+ and changes only final episode assembly behavior.

## Final assembly invariants
- Speaking scenes use exactly one authoritative validated synchronized clip in the final timeline.
- Unsynchronized coverage clips cannot be interleaved around a speaking scene.
- Speaking scenes are never extended beyond the synchronized clip duration, preventing silent padding.
- Selected scenes are rendered in deterministic selected-scene order.
- Duplicate scene positions and duplicate media references fail closed before recording.
- A final timeline validation manifest is saved with final-video metadata.
- Visual scene boundaries use a short bounded dip transition; no generated clip is looped to fabricate runtime.
- Non-speaking scenes may still use distinct planned visual coverage in shot order.

## Source-tree verification
- JavaScript/MJS syntax: PASS
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Non-core regression/runtime scripts: 82/82 PASS
- New v1.10.22 deterministic final-timeline runtime regression: PASS
- Deep QA inventory: 188 static IDs, 464 DOM references, 19 API routes, 3 local assets, 221 files checked

## Release limitations
No paid provider generation was executed from this environment. The browser-side MediaRecorder final episode was not rendered here with the user's production assets. Production acceptance therefore still requires rendering the existing 5/5-ready project and confirming scene order, synchronized dialogue, transitions, refresh/reopen persistence, and absence of unintended silence/random inserts.
