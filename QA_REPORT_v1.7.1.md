# CineTale v1.7.1 QA Report

Date: 2026-09-17

## Scope
- Create, Projects, Studio, Library and Settings navigation
- Email/password Supabase authentication
- Google OAuth entry/callback restoration
- Password visibility, reset request and recovery password update
- Project management and workspace backup
- Cast, voice, story, image, audio and video-generation hooks
- Final assembly manifest/sequence preview
- Responsive scene controls and overflow protection
- HTML/DOM integrity, JSON/package integrity, JS syntax and merge-marker contamination

## Automated checks passed
- `npm run check`
- `npm run smoke`
- `node --check` on every `.js` and `.mjs`
- HTML parse and duplicate-ID validation
- Local asset-reference validation
- CSS brace-balance validation
- Supabase env/config alias validation
- Package version validation
- Merge-marker scan
- Accidental local developer-path scan

## Responsive hardening
The scene action area now uses a bounded grid and progressively reflows from three action buttons + quality control on desktop to two columns on tablet and one column on narrow phones. Buttons and labels use wrapping and `min-width:0`/`max-width:100%` safeguards to prevent text from escaping cards.

## Auth improvements
- Email/password sign-in remains supported.
- Google OAuth button uses the configured Supabase Google provider.
- OAuth callback hash is restored into a CineTale session.
- Refresh-token renewal is attempted when a stored session is near expiry.
- Sign-up/sign-in errors are shown inside the account dialog.
- Forgot-password request and recovery password update are supported.
- `SUPABASE_ANON_KEY` and the newer `SUPABASE_PUBLISHABLE_KEY` env naming are both accepted.

## Important current boundary
CineTale can generate individual scene clips, preview them continuously, and lock a final assembly manifest. A true server-rendered single-file MP4 containing all clips plus final mixed narration/dialogue/SFX/music is not yet implemented in this static/Vercel-serverless build. Social-platform direct uploads should be enabled only after that render/export backend is added and each platform's OAuth/upload API is configured.

## Test-environment notes
Smoke tests intentionally exercise provider error/fallback paths. Simulated Gemini quota/request failures and ElevenLabs model fallback messages in the smoke log are expected test cases and did not fail the suite.
