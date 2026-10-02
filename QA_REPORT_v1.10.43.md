# CineTale v1.10.43 — Story-to-Shot Director RC

## Release intent

This release fixes the gap exposed by the Hindi sacred-story test: scene-level story intelligence was strong, but ungenerated shot plans could still be replaced by generic coverage such as “Orient the viewer” and repeated “Movement” cards. v1.10.43 makes the story-to-shot director contract first-class before any paid video generation.

## What changed

- Preserves AI-generated `coveragePlan` when it is concrete, filmable, and contains all required speaking turns instead of replacing it with a generic deterministic template.
- Migrates older ungenerated/template shot plans from `visualProgression`, scene dramatic purpose, character objective, obstacle, new information, emotional turn, entry/exit state, and continuity locks.
- Every non-speaking shot now carries a concrete `storyBeat`, director objective/action/avoid contract, and continuity metadata used by both the UI and video prompt.
- Speaking shots remain tied to exactly one named speaker and one exact spoken line, with story/emotional context but without stealing another shot’s reveal/action.
- Shot cards display the concrete story beat/visual event rather than generic placeholder coverage text.
- Selected non-speaking shots now show **Scene audio** (narration/ambience/foley truth) instead of a misleading character-voice control.
- Story-generation prompts explicitly forbid generic shot descriptions and require user-facing shot purpose/visual text to follow the selected story language when the entire-story language scope is active.
- Next-episode generation uses the same concrete story-to-shot contract.
- Existing paid/generated shot media is protected: CineTale does not reshuffle a timed shot plan after produced media exists merely because the planning engine improved.
- Existing durable video, voice, lip-sync, automatic scene-edit, storage, and final-assembly contracts are preserved.

## Validation performed on source tree

- `npm run check`: PASS
- `npm run smoke`: PASS
- `npm run qa:deep`: PASS
- Full carry-forward regression sweep (excluding the three commands above): **105/105 PASS**
- New v1.10.43 story-to-shot director regression: PASS (included in 105)
- JavaScript/module syntax validation: **132/132 PASS**
- Static DOM ID audit: **188 IDs, 0 duplicates**
- App-wide release audit regression: PASS

## Important preservation checks

- READY/generated paid media is not automatically regenerated or reordered by this release.
- Existing speaking-shot voice ownership and exact dialogue remain authoritative.
- Existing lip-sync completion, durable-storage recovery, scene preview, automatic scene edit, final timeline, and final-render safeguards remain green.
- Provider/debug details remain out of the normal-user media surface.

## Live-provider / browser limitation

No fresh billable Veo, ElevenLabs, or live lip-sync generation was performed as part of packaging QA. The deep suite exercises provider failure/fallback and request/state contracts, including expected mocked/error-path logs, but those logs are not evidence of a successful live provider generation. Live creative obedience of the richer shot-direction prompt still requires deployed testing.

## Recommended deployed validation

Open the existing Hindi Kailash project before generating video. Because its current scenes have no produced shot media, the old generic shot cards should migrate to concrete story beats derived from the scene’s `visualProgression`/dramatic state. Confirm that Scene 1 no longer shows repeated generic “Movement / Advance physical action…” descriptions. Then generate only one scene and judge whether the produced clips visibly perform the distinct planned events while preserving the locked Bal Ganesha, Bal Kartikeya, and Mata Parvati identities.
