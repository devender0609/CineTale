# CineTale v1.8.0 QA Report

Date: 2026-09-18

## Scope
- Create, Projects, Studio, Library, Settings and contextual project-management navigation
- Email/password Supabase auth, Google OAuth, password reset/recovery and session refresh
- Genre/language/cultural/sacred controls
- Cast add/edit/remove, portrait continuity and voice assignment
- Voice filtering, preview, lock state, narrator and scene performance controls
- Storyboard image generation and provider failure handling
- Veo scene-video generation, queueing, background polling and clip persistence
- Scene-card responsive layout and text containment
- Final assembly, one-file final video rendering, download, local persistence and native sharing
- Library media population including final videos
- DOM/HTML, CSS, JS, package/JSON and ZIP integrity

## Automated checks passed
- `npm run check`
- `npm run smoke`
- `node --check` for every `.js` / `.mjs`
- Import test for every API and library module
- Merge-marker scan
- JSON/package validation
- HTML parsing and duplicate-ID check
- Static local-asset reference validation
- CSS brace-balance and responsive-overflow rule checks
- Navigation target integrity
- Final-render controls/state/static integration checks
- Final-video IndexedDB persistence hooks
- MP4/WebM codec fallback hooks
- Native file-share/download fallback hooks

## Specific UI correction from QA
`Generate art`, `Listen`, and `Generate video clip` now use the same 14px font size, 800 weight, line-height, minimum height, centering and responsive wrapping rules. The primary button no longer inherits a smaller `.small` typography treatment.

## Final video behavior
- Requires every scene clip in the active production unit to be ready and Final Assembly to be prepared.
- Uses canvas + MediaRecorder to produce one file from the generated scene clips.
- Mixes scene ambient audio and approved character/narrator speech through Web Audio.
- Chooses MP4 when the browser advertises MediaRecorder MP4 support; otherwise records WebM.
- Stores the resulting Blob in IndexedDB and exposes it in Studio and Library > Media.
- Supports download and native file sharing to installed apps where the browser/OS exposes Web Share files.

## Accuracy boundary
CineTale does not label ungenerated runtime as finished footage. A 20–30 minute Movie only becomes a 20–30 minute finished Movie after sufficient scene/shot coverage has actually been generated. The final renderer assembles the real generated coverage and approved audio; it does not fabricate missing minutes.

## Provider-test notes
The smoke suite intentionally exercises Gemini quota/request errors and ElevenLabs model fallback behavior. Those logged warnings are expected test cases and did not fail the suite.

## Environment limitation
A managed Chromium binary exists in the QA container, but local page rendering is blocked by the container/browser organization policy, so interactive pixel-level browser screenshots could not be executed against the local server. Responsive behavior was instead checked by static CSS/DOM integrity plus existing production screenshots supplied by the user. Live final MediaRecorder codec output should be verified once after deployment in the user's actual browser because codec support is browser-dependent.
