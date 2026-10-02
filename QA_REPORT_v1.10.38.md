# CineTale v1.10.38 — Speaking Shot Completion RC

## Purpose
Repair the speaking-shot completion path so a generated video source is preserved and clearly shown as saved while approved character dialogue synchronization is still pending.

## Changes
- Speaking shots with durable source video but unfinished lip-sync now show **VIDEO SAVED · SYNC NEEDED** instead of falling back to a generic PLANNED label.
- `Finish Shot N dialogue` resumes only dialogue synchronization on the saved source video.
- The pending path is evaluated before any generation branch, preventing unnecessary Veo regeneration.
- After source generation, the shot timeline is reconciled immediately before lip-sync starts.
- If dialogue synchronization fails or is unavailable, the durable video source remains preserved and the UI stays in the pending dialogue state rather than implying the video must be regenerated.
- Story-directed continuity revision remains `v1.10.37-story-directed-continuity`; existing durable media is not invalidated.

## Validation
Source tree:
- 102/102 regression scripts passed.
- `npm run check` passed.
- `npm run smoke` passed.
- `npm run qa:deep` passed.

Live provider/browser limitation:
- No live Veo or live lip-sync provider generation was initiated during release QA. Production provider behavior still requires one deployed browser test.
