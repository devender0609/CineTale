# CineTale v1.10.51 — Legacy Dialogue Identity Lifecycle Fix

## Scope
This release addresses the persistent Scene 2 "Plan needs attention" failure seen in the existing Hindi Kailash project and performs a full regression/smoke/deep-QA release gate.

## Root cause confirmed
The shared production module (`lib/production.js`) parsed dialogue objects differently from `app.js`.

For object-form dialogue such as:

```js
{ speaker: 'बाल कार्तिकेय', text: 'माता, क्या किसी ने हमारी पावन वेदी पर प्रहार किया है?' }
```

`app.js` correctly retained the explicit `speaker`, but `lib/production.js` previously read only the text field. Its production-logic audit therefore treated the authoritative speaker as blank, repeatedly generated `speaker-mismatch` / unresolved production state, and could keep an otherwise valid persisted scene in "Plan needs attention" after repair.

This explains why earlier string-based regressions passed while the real persisted project could still fail.

## Fix
- Shared production dialogue parsing now preserves explicit object-form speaker fields (`speaker`, `character`, `name`, `who`).
- Inline `Name: line` strings remain supported.
- If an object has both an explicit speaker and a prefixed text label, the explicit speaker remains authoritative and only the spoken text is retained.
- Production logic gate revision advanced to `v1.10.51-system-integrity`.
- Cache-bust/build/package versions advanced to `1.10.51`.

## New lifecycle regression
Added `scripts-v11051-legacy-dialogue-object-lifecycle-regression.mjs` reproducing the real failure class:
- Hindi object-form dialogue
- stale legacy character IDs
- stale English shot speaker labels
- malformed legacy dialogue-turn indexes
- two speaking shots in an ungenerated scene

The regression verifies deterministic repair to:
- `बाल कार्तिकेय` → dialogue turn 0
- `माता पार्वती` → dialogue turn 1
- exact authoritative spoken lines
- valid production-logic audit after repair

## Full source validation
- 117 / 117 `scripts-*.mjs` checks passed
- 141 / 141 JS/MJS files passed `node --check`
- check passed
- smoke passed
- deep QA passed
- app-wide release audit passed

## Exact packaged artifact validation
The final ZIP was extracted into a clean directory and the same full gate was rerun there.

## Live-provider limitation
No fresh billable Veo, Gemini image, ElevenLabs, or lip-sync job was required for this identity/parser repair. Therefore live provider delivery is not claimed as re-verified by this release gate. Existing provider-facing regression and state-machine tests passed.
