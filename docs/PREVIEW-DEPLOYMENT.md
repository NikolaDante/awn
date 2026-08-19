# AWN Preview Deployment

## Environment

Vercel Preview requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Set both for the Preview environment. Do not commit their values.

## Supabase Auth URLs

Add the deployed Preview origin and these callback URLs to the Supabase authentication URL configuration:

- `https://<preview-domain>/auth/callback`
- `https://<preview-domain>/auth/reset`

If the project intentionally trusts every Vercel Preview deployment, configure an appropriate `*.vercel.app` redirect wildcard according to the team's Supabase policy. Prefer an exact deployment or stable branch-domain allow-list when possible.

## Preview Safety

- `/qa-seed` is available only when `NODE_ENV` is `development`; hosted Preview and production builds return 404.
- Normal routes do not accept a sample or demo presentation mode.
- Empty accounts display real empty states, never fixture financial records.
- QA fixtures remain test/development assets and are not loaded by authenticated application routes.

## Current Limitations

- Supabase authenticates users, but financial records are still stored only in browser `localStorage`.
- Browser records are namespaced by authenticated Supabase user ID, preventing another signed-in user in the same browser from opening that profile.
- There is no cloud financial persistence, cross-device sync, backup, or server-side recovery yet.
- Clearing site data or changing browser/device removes access to those local records.
- Plan remains usable but needs further product refinement.
- Insights uses first-version, current-profile calculations and is not a forecasting engine.

Treat the hosted build as a real-user usability Preview, not a production data service.
