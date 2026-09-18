# CineTale v1.8.1 QA Report

## Scope
Production hardening for optional scene inclusion, one-click automatic final production, final-video rendering, social publish handoff, authentication, responsive Studio controls, Library, voices, images, audio and Veo scene generation.

## New production behavior
- Every scene defaults to **Include in final**.
- Creators may uncheck any scene to skip it; skipped scenes do not require a video clip and are excluded from final assembly/rendering.
- **Create final video automatically** supports Fast / Balanced / Cinematic production modes.
- Automatic production generates only missing selected video clips, preserves existing clips, uses approved CineTale/ElevenLabs voices, prepares final assembly and renders one final video file.
- Duplicate automatic-final runs are guarded with a project-level browser lock.
- Existing manual controls remain available: Generate art, Listen, Generate video clip, Prepare final, Render full video.
- Final video can be downloaded, shared with the native device share sheet, or handed off to YouTube / Instagram / TikTok / Facebook upload pages after download.

## Validation performed
- package JSON validation
- merge-marker scan
- `node --check` across all JS/MJS files
- import of every API and library module
- full `npm run smoke` suite
- HTML parsing
- duplicate HTML ID scan
- local asset-reference validation
- CSS brace-integrity check
- responsive rules present for desktop/tablet/mobile
- scene include/skip integration checks
- automatic-final quality routing checks
- automatic-final duplicate-run lock checks
- Veo request regression checks
- ElevenLabs approved-voice final-mix checks
- final MediaRecorder MP4/WebM compatibility checks
- IndexedDB final-video persistence checks
- download/share/publish handoff checks
- ZIP integrity validation

## Expected test-log messages
The smoke suite intentionally exercises Gemini quota/error paths and ElevenLabs model fallback paths. Those logged failures are expected assertions of fallback behavior, not build failures.

## Important limitation
Direct server-side publishing into third-party social accounts is not faked in this build. The app provides native file sharing plus platform upload handoff. Fully automatic posting to YouTube/Instagram/TikTok/Facebook would require each platform's OAuth/app-review/API credentials and user authorization.
