# CineTale v1.10.4 QA Report — Authenticated Owned-Source Handoff

## Why this release exists
The live browser evidence showed that the CineTale browser could read the saved Supabase scene MP4 successfully (HTTP 200), TTS also succeeded, but `POST /api/lipsync-job` returned HTTP 422. The previous server path still depended on re-fetching a signed URL even though CineTale already knew the exact private storage object and the signed-in browser had authenticated access to it.

## Root-cause correction
For signed-in durable scene media, CineTale now sends the exact `sourceStoragePath` and the user's current authenticated Supabase bearer session to `/api/lipsync-job`. The server reads the exact private object directly from Supabase Storage using `SUPABASE_URL`, the configured anon/publishable key, and the user's bearer token. It then submits the actual MP4 bytes plus the exact approved audio to Sync Labs. The signed URL remains only a compatibility fallback when no verified private storage identity is available.

This closes the gap where the browser could GET the object successfully while the server's separate signed-URL fetch failed.

## Security / ownership behavior
- The browser does not expose provider API keys.
- Supabase private-object access remains authorized by the user's bearer token and existing storage policy.
- A storage path alone is not treated as sufficient authorization.
- Existing provenance, exact speaking-shot selection, voice/audio digesting, idempotency and synchronized-result durability checks remain in place.

## New runtime regression
`scripts-v1104-authenticated-storage-handoff.mjs` simulates:
1. CineTale scene has a verified private Supabase storage path.
2. User has an authenticated Supabase session.
3. The legacy/signed URL is deliberately unusable.
4. `/api/lipsync-job` receives the storage path + bearer session.
5. Server reads the exact object from Supabase Storage with authenticated headers.
6. Actual MP4 bytes and approved audio are sent to Sync Labs.
7. The stale signed URL is never fetched.

Result: PASS.

## Source-tree verification
- `scripts-check.mjs`: PASS
- `scripts-smoke.mjs`: PASS
- `scripts-deep-qa.mjs`: PASS
- 61 dedicated regression scripts: PASS
- All `api/*.js`, `lib/*.js`, and `app.js` syntax checks: PASS
- Deep QA: 182 static IDs, 462 DOM references, 19 API routes, 3 local assets, 182 files checked.

## Limitations
No live paid Sync Labs generation was initiated from this environment. Therefore the final production acceptance remains one deployed speaking scene: Finish clip -> queued provider job -> synchronized playable AV -> refresh -> same AV -> reopen -> same AV. This report does not claim that live provider acceptance has occurred.
