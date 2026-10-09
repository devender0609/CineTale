# CineTale v1.12.66 — private media staging validation

This is **not** an approved production release. Deploy in a separate Vercel *staging project* only, never over the existing CineTale production deployment. No database migrations are required for the playback probe and experimental `db/` migrations MUST NOT be applied to production.

## What changed since the earlier staging ZIP

The working tree now contains `api/test-private-playback.js`, a fixed-object, authenticated, development-only playback probe for `cinetale-test-media/assembled.mp4`, and its regression suites. The endpoint is **off unless explicitly enabled**. No provider generation is performed by this route.

## Required Vercel environment setup for a staging project

- `CINETALE_RUNTIME_MODE=development`
- `CINETALE_ALLOW_PAID_GENERATION=false`
- `CINETALE_ENABLE_PRIVATE_MEDIA_PROBE=true`
- `CINETALE_PRIVATE_MEDIA_TEST_USER_ID=` (UUID of the **authorized test user**, obtainable from Supabase Authentication > Users; do not send credentials in chat)
- `CINETALE_PRIVATE_MEDIA_TEST_SHA256=B48865AFB24CBFB3E13EC1083F8AA932DB8411652C5B7207D9DD0BFC3E12D88C` (checksum of the synthetic MP4)
- `SUPABASE_URL=` (existing project's URL)
- `SUPABASE_ANON_KEY=` (existing project's publishable/anon key)
- `SUPABASE_SERVICE_ROLE_KEY=` (**server-only secret**; never expose in NEXT_PUBLIC/VITE variables or browser code)

No real provider keys are required for the playback-probe test. Use the minimal required credentials. Note: connecting a staging deployment to the production Supabase project shares its Auth/users; strictly restrict the probe to the test user. This endpoint is not a general project playback API.

## Invocation

`GET /api/test-private-playback` with `Authorization: Bearer <the user's Supabase access token>`.

Supported: `HEAD`, `GET`, single byte ranges (`Range: bytes=0-1023`). Expected: 401 missing/invalid auth, 403 other user, 200 authorized full object, 206 valid range, 416 invalid range, 404 when probe disabled. No browser UI button is provided for this endpoint.

## Local checks exercised

- `node scripts-private-playback-probe-regression.mjs`
- `node scripts-private-playback-bounded-stream-regression.mjs`
- `node scripts-private-playback-http-integration.mjs`
- `node scripts-private-playback-real-mp4-integration.mjs`
- `npm run check`
- `npm run smoke`
- `npm run qa:deep`

Live Vercel-to-Supabase playback **not tested**. Google jobs and full production orchestration **not validated**. New paid generation must stay blocked.
