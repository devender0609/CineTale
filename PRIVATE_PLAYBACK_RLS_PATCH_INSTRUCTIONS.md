# CineTale staging: scoped Supabase private playback patch

**This is a staging-only security patch, not a new production CineTale release.**
It changes only the fixed test-media endpoint, its regression fixtures, and its documentation.

Copy the files from this patch into the existing local `Staging` Git checkout, preserving relative folders. Do **not** run `git init`, merge into `main`, or replace production environment variables.

## Required manual steps before enabling the probe

1. Keep the existing Preview guards `CINETALE_RUNTIME_MODE=development` and `CINETALE_ALLOW_PAID_GENERATION=false`.
2. In Supabase > Authentication > Users, choose the existing **test** user's UUID. Never share access tokens or secret keys in chat.
3. Review `engineering/PRIVATE_TEST_MEDIA_RLS.sql`; replace `<REPLACE_WITH_AUTH_USER_UUID>` with that UUID, then apply **only this single CREATE POLICY** in Supabase SQL Editor. It authorizes `SELECT` on `storage.objects` only for that user, bucket `cinetale-test-media`, and object `assembled.mp4` (the bucket must remain private). Review other storage policies separately; PostgreSQL RLS policies combine permissively.
4. In Vercel Preview, configure `SUPABASE_URL`, `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`, `CINETALE_PRIVATE_MEDIA_TEST_USER_ID` (same UUID), and `CINETALE_PRIVATE_MEDIA_TEST_SHA256=B48865AFB24CBFB3E13EC1083F8AA932DB8411652C5B7207D9DD0BFC3E12D88C`. Keep the probe OFF while deploying.
5. **Never add `SUPABASE_SERVICE_ROLE_KEY` to Preview.** After the updated staging branch deploys, first verify the disabled 404. Only then enable `CINETALE_ENABLE_PRIVATE_MEDIA_PROBE=true` in Preview and redeploy as needed. Call `GET /api/test-private-playback` with `Authorization: Bearer <signed-in test user's Supabase access token>` via a secure local HTTP client; opening the URL in an unauthenticated browser will return 401 when enabled.
6. When done, turn off the probe and run the commented `DROP POLICY` cleanup from the SQL file.

## Security boundaries / limitations

- The probe always fetches one fixture using the **user JWT**, never a service key; Supabase Storage enforces row-level security.
- A matching user can also fetch this exact fixture directly via Supabase Storage. Other existing broad storage policies might independently grant additional access and must be reviewed before claiming global isolation.
- This does not validate or fix production media ownership, all paid endpoints, provider recovery, or production release readiness. No live Supabase test has yet been performed.
- Local checks completed: probe regression, bounded streaming, HTTP integration, real 23,345-byte MP4 integration, `npm run check`, `npm run smoke`, `npm run qa:deep`. All passed locally; test fetch handlers are mocked.
