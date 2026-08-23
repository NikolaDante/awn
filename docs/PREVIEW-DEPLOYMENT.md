# AWN Preview Deployment

## Permanent testing URL

AWN has one user-facing testing URL: `https://awn-preview-awn4.vercel.app`.

For every approved Preview release: deploy a fresh immutable Preview, verify it internally, repoint this same alias to the verified deployment, verify the stable alias, and give the user only the stable URL. Immutable deployment URLs are deployment records, not user-facing testing links.

## Environment

Vercel Preview requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` only after Google is enabled in Supabase
- `NEXT_PUBLIC_AUTH_APPLE_ENABLED=true` only after Apple is enabled in Supabase

Set both Supabase variables for the Preview environment. Do not commit their values or add a service-role key to any browser-visible variable.
The social-auth flags are public readiness switches, not provider credentials. Leave a flag false or unset until its Supabase provider and redirect URLs are ready so AWN never displays a knowingly broken button.

## Supabase Auth URLs

Use the permanent testing URL as the Supabase Site URL and allow:

- `https://awn-preview-awn4.vercel.app/auth/callback**`

Keep required localhost callbacks for development. Do not accumulate immutable Preview hosts in Supabase or Google OAuth configuration. Google uses the stable AWN origin while its provider redirect URI remains the Supabase `/auth/v1/callback` endpoint.

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
