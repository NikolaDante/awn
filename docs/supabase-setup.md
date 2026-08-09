# AWN Supabase setup

Milestone 5A establishes authentication and the database contract. AWN still reads and writes the existing local profile only; this milestone deliberately has no local-data migration or cloud financial-data API.

## Create a project and configure the application

1. Create a Supabase project and apply every migration in `supabase/migrations/` in filename order using the Supabase SQL editor or your normal migration workflow. This includes the initial financial foundation (`20260809000000_initial_financial_foundation.sql`) and the additive profile-trigger repair (`20260809010000_create_missing_financial_profiles.sql`).
2. Copy `.env.example` to `.env.local` and fill in only the project URL and browser-safe publishable key. Keep `.env.local` untracked. Never put secrets in source control or browser code.
3. In Supabase Auth URL Configuration, set the Site URL to `http://localhost:3001` for local development and add these redirect URLs:
   - `http://localhost:3001/auth/callback`
   - `http://localhost:3001/auth/callback?next=/auth/reset`
   - the equivalent production callback and recovery URLs, for example `https://app.example.com/auth/callback` and `https://app.example.com/auth/callback?next=/auth/reset`
4. Enable email/password sign-in. Confirm the configured email provider and templates send confirmation and recovery links to the callback URLs above.
5. Start AWN with `pnpm dev -- --port 3001`, then test sign-up, email verification, sign-in, sign-out, password reset, and a protected route such as `/dashboard`.

## Security and migration notes

- The browser receives only the publishable key. A Supabase service-role key must never be added to this app, its environment examples, client bundle, or logs.
- Every application table has row-level security. Explicit SELECT, INSERT, UPDATE, and DELETE policies enforce `auth.uid()` where client access is intended, and ownership triggers also reject `user_id` reassignment. Transaction foreign keys include `user_id`, so a transaction cannot reference another user’s planning data.
- The additive repair creates a narrowly scoped `SECURITY DEFINER` trigger on `auth.users` that creates one default financial profile per new user and backfills only users missing one. Its empty search path, schema-qualified references, and revoked client EXECUTE privileges keep the elevated operation internal.
- Anonymous and public table privileges are explicitly revoked. Authenticated clients receive owner-scoped CRUD only on financial domain tables. Migration records and security events remain internal and have no direct client grants.
- Security events are reserved for trusted server or database creation. They are not user-editable and must not be treated as user-submitted audit evidence.
- `FORCE ROW LEVEL SECURITY` is intentionally not enabled because trusted Supabase table-owner and server roles need to apply migrations and create internal records. AWN application code still uses only the publishable key and never bypasses RLS.
- Amounts are integer minor units in the database. The profile stores the supported base currency, so cross-currency conversion is intentionally not modeled in this milestone.
- Historical transaction labels are snapshots. Stable local entity IDs and non-null per-user idempotency keys are included so a later opt-in migration can preserve references and retry safely. Linked planning records use deferred `NO ACTION`, so ordinary deletion cannot remove transaction history while an auth-user deletion can still cascade through the complete owned dataset.
- Confirmation and recovery emails are subject to Supabase project email limits. During development, use a controlled test address and allow for provider throttling before retrying.
- After applying the migration, use the Supabase dashboard’s table and policy views to verify that RLS is enabled and that no anonymous policy exists for AWN tables.
