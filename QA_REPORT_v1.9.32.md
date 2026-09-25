# CineTale v1.9.32 — Stale Video Operation Recovery QA

## Scope
This build changes only saved/pending video-operation recovery behavior on top of v1.9.31. It does not intentionally alter Projects navigation, auth, cloud sync, visual generation, voice, consent, story generation, toolbar styling, or final assembly.

## Fixed live issue
A previously saved `videoOperation` could make a scene appear to be **Rendering…** immediately when the project was reopened, even before CineTale had confirmed that the provider job still existed or was still active.

v1.9.32 now:
- treats restored video operations as **unverified** on a new page/session;
- shows **Checking saved render…** instead of claiming the scene is rendering;
- immediately checks `/api/video-status` before resuming polling;
- resumes **Rendering…** only when the provider confirms `processing`, `pending`, or `running`;
- immediately installs the replacement clip if the saved operation is already `ready`;
- clears failed, missing, unknown, expired, or unverifiable saved operations while preserving the previous clip;
- expires unconfirmed saved operations after 20 minutes so a scene cannot remain stuck indefinitely;
- prevents Regenerate from submitting a duplicate job while a saved operation is being reconciled.

## Regression validation
- `npm run check` — PASS
- `npm run smoke` — PASS
- `npm run qa:deep` — PASS
- JavaScript syntax (`node --check app.js`) — PASS
- 177 static IDs checked
- 442 DOM references checked
- 16 API routes checked
- 49 files deep-checked

The smoke suite explicitly checks that restored jobs are distinguished from verified active jobs and that the stale-operation recovery path is present.

## Expected simulated QA logs
The smoke/deep suite intentionally exercises provider error paths including Gemini quota/image-delivery failures and an ElevenLabs model fallback. Those messages are test fixtures; the suites completed successfully.

## Live acceptance test after deployment
1. Confirm **Settings → System Health → App build: v1.9.32**.
2. Open the scene that previously showed `Rendering replacement` immediately.
3. CineTale should first say **Checking saved render…** if a saved operation remains.
4. It should then do one of three valid things: recover a ready clip, resume verified rendering, or clear the stale job and restore the normal Regenerate control.
5. It must not remain in `Rendering…` solely because an old operation ID exists.

Production provider status itself cannot be live-verified from this container because the deployment secrets are not available here.
