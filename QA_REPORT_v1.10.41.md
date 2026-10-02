# CineTale v1.10.41 — Automatic Scene Edit RC — QA Report

## Scope
This release adds a non-destructive automatic scene-edit layer on top of READY shot timelines. It does not regenerate paid video assets. The same edit contract is used by Scene Preview and the browser final-render path so preview and output no longer follow different timing rules.

## Implemented behavior
- `Play edited scene` replaces the raw sequential preview once every planned shot is READY.
- A deterministic scene edit plan is derived per shot (`SCENE_EDIT_PIPELINE_REV = v1.10.41-auto-editorial-flow`).
- Conservative trim-in / trim-out removes only short generator-settle/dead tails while preserving spoken dialogue.
- Dialogue-to-dialogue and speaking transitions remain clean cuts; only adjacent visual coverage can receive a bounded 110 ms soft cut.
- Visual-shot provider audio remains suppressed; only validated synchronized speaking media is authoritative dialogue audio. Narration remains available when the existing controlled narration asset is present.
- Final rendering consumes the same edit-plan trim contract and records `pipelineVersion: 13`, `durationMode: auto-edited-planned-shot-story-timeline`, and `transitionPolicy: dialogue-safe-auto-edit-v1`.
- No `/api/video-job`, lip-sync submission, or other paid-media generation is initiated by the edit planner or edited-scene preview.
- Existing READY scene/shot media remains protected.

## Source validation
- Full carry-forward regression sweep: **106/106 PASS**.
- `npm run check`: PASS.
- `npm run smoke`: PASS.
- `npm run qa:deep`: PASS.
- `node --check app.js`: PASS.
- JavaScript/module syntax audit: **130 files PASS**.
- Named functions in `app.js`: **511**, duplicate named definitions: **0**.
- Static DOM IDs in `index.html`: **188**, duplicates: **0**.
- Merge/conflict/FIXME marker scan on release-critical UI files: PASS.
- New `scripts-v11041-auto-scene-editor-regression.mjs`: PASS.

## Provider/runtime limitation
The automated QA harness exercises mocked/failure/fallback provider paths and prints expected quota/model fallback diagnostics. This release was **not** claimed as a live Veo/ElevenLabs/lip-sync provider verification, and the model environment cannot reproduce the user's deployed Vercel browser session. The first deployed verification should therefore be Scene 2 `Play edited scene`, checking the five-shot timing and dialogue-safe cuts. No provider call is required for that verification because the scene already has READY media.

## Exact-artifact gate
The release ZIP must be extracted into a clean directory and the complete 106-script regression sweep, check, smoke, deep QA, syntax audit, duplicate-function audit, and duplicate-ID audit rerun before delivery. Results are recorded after packaging below.

### Exact packaged ZIP result
- Exact extracted artifact regression sweep: **106/106 PASS**.
- Exact extracted artifact `npm run check`: PASS.
- Exact extracted artifact `npm run smoke`: PASS.
- Exact extracted artifact `npm run qa:deep`: PASS.
- Exact extracted artifact JS/MJS syntax audit: **130 files PASS**.
- Exact extracted artifact named functions: **511 / 0 duplicate definitions**.
- Exact extracted artifact static DOM IDs: **188 / 0 duplicates**.
