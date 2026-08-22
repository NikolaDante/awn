# AWN Preview Deployment

## Environment

Vercel Preview requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Set both for the Preview environment. Do not commit their values or add a service-role key to any browser-visible variable.

## Supabase Auth URLs

Add the deployed Preview origin and these callback URLs to Supabase Auth URL Configuration:

- `https://<preview-domain>/auth/callback`
- `https://<preview-domain>/auth/reset`

If the project intentionally trusts every Vercel Preview deployment, configure an appropriate `*.vercel.app` redirect wildcard according to the team’s Supabase policy. Prefer an exact deployment or stable branch-domain allow-list when possible.

## Preview safety

- `/qa-seed` is available only when `NODE_ENV` is `development`; hosted Preview and production builds return 404.
- Normal routes do not accept a sample or demo presentation mode.
- Empty accounts display real empty states, never fixture financial records.
- QA fixtures remain test/development assets and are not loaded by authenticated application routes.

## Cloud persistence semantics

- Supabase is authoritative for onboarding state and all financial data.
- Each user currently works in one automatically created personal Household.
- A valid legacy browser profile imports only when the Household profile is empty. Cloud data always wins over stale local data, and a migration backup is retained locally.
- Refresh, sign-out/sign-in, clearing AWN financial localStorage keys, and signing in from another browser must all recover the same committed cloud state.
- Phase 3 does not promise realtime updates. Refresh a second open browser to load changes made elsewhere.
- Shared invitations, member management, Household switching, and ownership transfer are deferred to the shared-budgeting phase.

Treat the hosted build as a real-user Preview backed by the linked Supabase project. Do not deploy it to Production or a custom domain as part of Preview verification.
