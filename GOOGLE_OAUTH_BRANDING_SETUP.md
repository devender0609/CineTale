# CineTale Google sign-in branding

## Why Google currently shows the Supabase hostname

CineTale starts Google OAuth through Supabase Auth. When Supabase is used on its default project hostname, Google can display that hostname (for example `xxxx.supabase.co`) on the account chooser. Front-end wording cannot rename that third-party OAuth origin.

## Production branding path

1. Configure a custom domain for the CineTale Supabase project, for example `https://auth.<your-cinetale-domain>`.
2. In Google Cloud's OAuth configuration for the same Google provider, use **CineTale** as the application/product name and update the authorized redirect URI(s) to the Supabase custom-domain callback required by your Supabase project.
3. In Vercel, keep `SUPABASE_URL` as the normal CineTale Supabase project API origin and add:

   `SUPABASE_OAUTH_URL=https://auth.<your-cinetale-domain>`

4. Redeploy CineTale and test **Continue with Google** in a private/incognito browser window.

CineTale v1.9.75 uses `SUPABASE_OAUTH_URL` only to start Google OAuth. Email/password auth, workspace sync, and private final-video storage continue to use `SUPABASE_URL`.

If `SUPABASE_OAUTH_URL` is not configured, CineTale intentionally falls back to `SUPABASE_URL` so sign-in continues to work instead of breaking.
