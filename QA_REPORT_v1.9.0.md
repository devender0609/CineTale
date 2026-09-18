# CineTale Studio v1.9.0 — Full Story Review / Production Gate QA Report

Date: 2026-09-18
Baseline: CineTale Studio v1.8.4 — Final Assembly Reliability

## Release focus

This release closes the workflow gap discovered during the Story test: CineTale could generate a scene plan and synopsis, but the creator was not shown a complete, editable narrative before image/audio/video production.

v1.9.0 adds a full-story review and approval gate while preserving the existing cast, storyboard, audio, video, final-assembly, quota-aware production, account, library and responsive workflows.

## Functional changes verified

- Complete `storyText` is now required from new Story/Short/Movie/Episode plan generation.
- Story generation instructions explicitly require a full audience-readable narrative rather than a synopsis or outline.
- Story duration guidance is supplied to the planner so the full narrative scales with the selected runtime.
- New plans are never model-preapproved: `storyApproved` is normalized to `false` server-side.
- The Studio now displays a dedicated **Story Review** panel with the complete narrative, review status, word count/runtime context, and edit/approve actions.
- Creators can edit the complete story and rebuild the production plan from the revised narrative.
- Legacy projects that do not yet contain `storyText` remain usable and can optionally generate a full story review; they are not unexpectedly locked.
- New projects with a full story must be approved before paid/production-oriented actions unlock.
- The approval gate covers character portraits, storyboard art, audio/listen generation, individual video clips, final assembly, final render, and one-click automatic final video production.
- Workflow status begins at **Review the complete story**, then advances to **Review your cast** after approval.
- User-facing automatic-production wording no longer exposes provider-limit jargon; technical provider details remain diagnostic concerns.
- Episode continuation generation also requires a complete new episode story and starts that episode in an unapproved review state.

## Automated validation

### Syntax / module checks — PASS

- `node --check` passed for `app.js`, all API modules, library modules and QA scripts.
- All existing files from v1.8.4 remain present; no baseline application files were accidentally removed.
- JSON/package validation passed.
- Merge-conflict marker scan passed.

### Existing integrity check — PASS

Command: `npm run check`

Result: `CineTale checks passed: no merge markers; JSON valid.`

### Comprehensive smoke suite — PASS

Command: `npm run smoke`

Covered and passed:

- account/auth configuration behavior
- workspace and library behavior
- responsive scene controls
- quota-aware one-click final production
- Veo Lite fallback path
- safe paced video generation
- transient provider retry behavior
- preloaded final-render preparation
- approved ElevenLabs audio path and fallback handling
- final video render / download / share wiring
- final assembly / manifest generation
- voice filtering
- top navigation
- DOM integrity
- Story Review presence, planner contract, approval gating, and creator-facing wording

The quota, image-delivery and TTS errors printed during the smoke suite are intentional simulated provider failures used to verify fallback/error handling. They are not failed tests.

### Deep static QA — PASS

Command: `npm run qa:deep`

Result: `173 static IDs, 392 DOM refs, 12 API routes, 3 local assets, 32 files checked.`

Checks include:

- duplicate static element IDs
- JavaScript DOM references against actual markup/dynamic IDs
- referenced API route existence
- local asset existence
- view/navigation targets
- CSS brace integrity
- Story Review production-gate hooks
- creator-facing provider-jargon regression check
- merge markers and obvious packaging integrity issues

### Headless Chromium interaction QA — PASS

A real Chromium browser was used with local provider calls stubbed so no external quota was consumed.

Passed interactions:

- Studio opens with a saved project
- full Story Review panel renders
- complete narrative is visible rather than only the synopsis
- unapproved story is visibly marked **Needs review**
- storyboard art is disabled before approval
- automatic final video is disabled before approval
- workflow correctly directs the creator to review the story first
- approving the story changes status to **Approved**
- storyboard art unlocks after approval
- workflow advances to cast review
- full-story editor opens with the complete narrative prefilled
- story editor cancels cleanly
- Projects navigation works
- Library navigation works
- Create navigation works
- Studio navigation works
- dark-mode toggle works
- 390px mobile viewport has no page-level horizontal overflow

## Demo planner checks — PASS

Offline/demo plan generation was checked for all creation types:

- Episode: complete story + 5-scene plan, unapproved by default
- Short: complete story + 3-scene plan, unapproved by default
- Story: complete story + 5-scene plan, unapproved by default
- Movie: complete story + 8-scene plan, unapproved by default
- Next Episode: complete continuation story and unapproved review state

## Regression review

Compared with the v1.8.4 baseline, intentional changes are limited to:

- `.env.example`
- `README.md`
- `api/generate-next.js`
- `api/generate-plan.js`
- `app.js`
- `index.html`
- `lib/demo.js`
- `package.json`
- `scripts-smoke.mjs`
- `styles.css`
- new `scripts-deep-qa.mjs`
- this v1.9.0 QA report

No baseline application file is missing.

## Important deployment note

Local QA verifies the application logic, UI wiring, error handling, provider contracts through mocks/simulations, and browser behavior without spending live generation credits. Actual Gemini, ElevenLabs and Veo output still depends on the API keys, model access, billing/quota, and provider availability configured in the deployed Vercel environment. A live provider call cannot be guaranteed by an offline package test.

## Release verdict

**PASS — suitable for deployment/testing as CineTale Studio v1.9.0.**

The Story workflow now provides the missing full-story review/edit/approval step before production and the existing smoke/integrity/browser checks pass. The next live test should create a new Story from one sentence, review the entire generated narrative, approve it, then generate only one storyboard image first before proceeding to full production.
