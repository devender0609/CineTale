# CineTale v1.11.2 QA Report

## Release
CineTale v1.11.2 — Create-page polish / simplified story input / sticky planning actions.

## Product changes
- Simplified Story Basics voice input: the separate Type/Speak control panel was removed from the visible layout and replaced by a compact optional Speak control attached to the editable story area.
- Preserved the existing browser speech-recognition and recorded-transcription fallback paths and their stable DOM IDs.
- Added a sticky Create planning action bar so Save to My Stories and Build <format> plan remain reachable while reviewing the form.
- Marked Movie as **Long-form beta** and updated its explainer to make long-form status and cost planning explicit without removing the existing Movie planning path.
- Shortened the lower Create-page marketing headline.
- Reframed the four capability cards around the redesigned product: Story Intelligence, World & Cultural Intelligence, Characters & Continuity, and Smart Production & Cost Control.
- Preserved Global Story Intelligence, World & Culture progressive disclosure, production profiles, Cost Guardian, durable-media recovery, dialogue-sync safeguards, and previous production-integrity logic.

## Validation on working tree
- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Full regression/runtime script sweep: **131/131 PASS**
- JS/MJS syntax sweep: **158/158 PASS**
- Dedicated v1.11.2 Create polish regression: **12/12 PASS**
- Deep QA: **199 static IDs, 500 DOM references, 19 API routes, 3 local assets, 323 files checked**

## Provider/testing note
The QA suite exercised provider failure/fallback handling in test paths. No paid Veo or dialogue-sync generation was intentionally submitted for this UI release. Live production-provider behavior still requires controlled deployment verification.
