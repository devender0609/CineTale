# CineTale v1.9.86 — Strict Production Identity Contract

## Release purpose
This release addresses the observed class of failures where a technically playable synchronized MP4 can still belong to the wrong character, wrong dialogue line, wrong voice, wrong source shot, or stale scene state.

## Changes
- Added a strict video production contract that binds project, episode, scene, timed shot, speaker, speaker character ID, exact line, visual/camera intent, storyboard asset key, and recurring cast descriptors.
- New speaking video renders persist that production contract before provider polling begins.
- Lip-sync is refused for legacy speaking source videos that do not carry the strict v1.9.86 production contract. This prevents older ambiguous media from being silently reused.
- Lip-sync audio now uses exactly one dialogue item corresponding to the primary speaking shot. It no longer concatenates all narration/dialogue from a scene into a single speaking clip.
- The exact lip-sync job is bound to the current production contract, scene signature, approved audio digest, request digest, scene ID, and provider request ID.
- Provider results are rejected if the production contract or request digest changed while the provider job was running.
- Validated synchronized media now requires both source-video production provenance and approved-audio provenance.
- Speaking-shot Veo prompts explicitly lock the named speaker identity and instruct any other visible character to keep their mouth closed during the line.
- Legacy synchronized outputs are not auto-trusted merely because they are playable.

## Uploaded clip audit used for this release
The two user-supplied synchronized MP4s were technically valid H.264/AAC files with audio/video tracks starting at 0.000 s and closely matched track durations. Visual inspection showed materially inconsistent recurring-character appearance between the clips. This supported treating the defect as production identity/provenance, not a simple muxing timestamp offset.

## Automated validation
- 50/50 regression, smoke, deep-QA, and targeted production-contract scripts passed on working source.
- 74/74 JavaScript/MJS files passed `node --check`.
- New targeted regression verifies strict character/shot/audio/sync production identity, exact speaking-shot audio selection, and speaker-lock prompt requirements.

## Important live-provider limitation
No new paid Veo, ElevenLabs, or lip-sync generation was triggered in this environment. Therefore this report does not claim that a newly generated live provider clip was visually inspected end-to-end here. The release deliberately blocks ambiguous legacy speaking media instead of claiming it is correct.

## Expected behavior for existing projects
Existing speaking video clips created before v1.9.86 do not have the new production identity contract. CineTale will not silently mark them synchronized/ready. The creator must regenerate the affected speaking clip once; the story, storyboard, character voice selection, and other unaffected project data are preserved.
