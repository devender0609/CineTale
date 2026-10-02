# CineTale v1.9.92 QA Report

## User-visible defect fixed
After a source scene video had already been generated and durably stored, clicking **Listen** could make that prior video appear to be gone because v1.9.89 intentionally hid every unsynchronized speaking-source video behind the storyboard/poster until lip-sync completed.

v1.9.92 separates the two review surfaces without destroying either one:
- the existing generated source video remains mounted and visible as a clean **muted visual preview**;
- **Listen** generates/plays the approved CineTale character voice independently;
- the source preview cannot expose provider speech;
- clicking Listen does not render/remount Studio or remove the video element;
- only a strictly validated synchronized picture+voice asset becomes the authoritative audible speaking clip.

No technical/status badge is overlaid on the video.

## Regression coverage
A dedicated `scripts-v1990-listen-preserves-video-regression.mjs` gate verifies that:
1. unsynchronized speaking source video remains mounted with native controls;
2. the preview is muted and sync-gated;
3. Listen uses the independent approved-audio path;
4. Listen does not call `renderStudio()` and therefore does not intentionally remount/remove the scene video;
5. provider audio cannot be unmuted through native controls while the clip is unsynchronized.

Older tests that required hiding the source player were updated because that behavior directly contradicted the newly observed real-user requirement. The lip-sync pipeline revision itself remains `v1.9.89-end-to-end-speaking-clip`, so this UI/playback correction does not intentionally invalidate already-valid paid synchronized assets.

## Validation results
- Full CineTale script suite: **54/54 passed**
- JavaScript/MJS syntax validation: **78/78 passed**
- Includes smoke, deep QA, player lifecycle, media ownership, timed-shot, character/voice provenance, lip-sync, final-assembly, MIME/range, persistence, and scene-isolation regressions.

## Live-provider limitation
No new paid Veo, TTS, or lip-sync generation was performed during this validation. The fix was validated against the code/state contracts and the full automated suite. Exact deployed Firefox/Vercel/provider behavior still requires the user's live one-scene test.
