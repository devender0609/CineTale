# CineTale v1.10.37 — Story-Directed Continuity RC

## Purpose
Strengthens multi-shot video generation so shots are directed as sequential story coverage rather than independent variations of the same scene description.

## Changes
- Adds deterministic director objectives/actions/avoid rules for establishing, speaking, movement, reaction, detail and other coverage shots.
- Separates STORY-BEAT CONTEXT from CURRENT SHOT ACTION in the Veo prompt.
- Adds a hard Scene Continuity Contract containing locked cast, locked location/lighting, story-critical prop continuity, previous-shot state, next-shot intent, anti-repetition and action-continuity rules.
- Explicitly tells later shots to continue after prior actions rather than replay them.
- Prevents establishing shots from pre-playing the main reveal, reaction shots from repeating discovery, and detail shots from widening into generic character coverage.
- Preserves the existing durable-media production contract revision so already-generated assets are not invalidated or automatically regenerated.

## Validation
- Targeted v1.10.37 story-directed continuity regression: PASS.
- Full source regression sweep: 101/101 scripts PASS.
- `npm run check`: PASS.
- `npm run smoke`: PASS.
- `npm run qa:deep`: PASS.

## Live-provider limitation
No live Veo generation was performed as part of packaging QA. Prompt construction and state/credit protections were validated locally. A deployed provider test is still required to judge visual continuity quality in actual generations.
