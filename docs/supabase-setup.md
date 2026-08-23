# AWN Supabase setup

Supabase is AWN’s authoritative financial persistence layer. The browser uses only the project URL and publishable key; no service-role credential belongs in the app, client bundle, source control, or logs.

## Project setup

1. Apply every file in `supabase/migrations/` in filename order. The Phase 3 migration evolves the existing financial foundation rather than creating a parallel model.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Keep `.env.local` untracked.
3. Configure Supabase Auth with the local and deployed callback/recovery URLs described in `docs/PREVIEW-DEPLOYMENT.md`.
4. Enable email/password authentication and verify sign-up, confirmation, sign-in, sign-out, and recovery with a controlled test address.
5. For Google or Apple login, follow `docs/AUTH-OPERATIONS.md`; provider secrets remain in Supabase Auth, never in AWN or Vercel public variables.

## Household ownership model

- Every authenticated user automatically receives one personal `My Household` workspace and an `owner` membership. No extra onboarding screen is required.
- Durable financial state belongs to `household_id`, not directly to an individual user. `household_members` is the authorization boundary and already supports `owner` and `member` roles.
- The provider resolves an `activeHouseholdId`. Phase 3 always chooses the user’s personal Household; switching, invitations, member management, and household merging are deferred.
- Deleting an auth user removes that user’s membership and nulls creator attribution. It does not delete a Household merely because its creator disappears. The current personal Household may consequently remain ownerless until shared-ownership lifecycle rules are added.

## Financial persistence

`financial_profiles.profile_data` is the canonical Phase 2 financial snapshot. Saving the complete validated profile in one PostgreSQL RPC keeps transactions, balances, references, budget snapshots, goals, cash, and onboarding settings atomic. Existing normalized tables are retained and moved behind the same Household RLS boundary for migration/history compatibility; the app does not treat them as a second source of truth.

The save RPC uses a row lock and expected revision. A stale browser receives a conflict instead of overwriting newer data. Transaction creator/updater attribution is assigned by the database from `auth.uid()` and cannot be forged by the browser.

## Existing browser-data migration

On first authenticated load:

- an initialized cloud profile always wins;
- an empty Household plus a valid authenticated-user-namespaced local profile imports that profile once;
- the cloud write and migration marker commit together;
- a revision conflict reloads the now-authoritative cloud profile;
- the old browser record is retained and also copied once to `awn.financial.profile.cloud-migration-backup.v2:<user-id>`.

The backup is recovery-only and is never read as authoritative after the Household is initialized. It may be removed in a later, separately approved cleanup phase.

## Security model

- RLS is enabled on Household and financial tables. Reads require Household membership.
- Clients cannot create memberships or assign an arbitrary owner. Personal Household initialization is a narrowly scoped `SECURITY DEFINER` operation bound to `auth.uid()` or the auth-user trigger.
- Financial mutation uses the membership-checked atomic RPC. Direct writes remain revoked, so UUID knowledge alone never grants access.
- Anonymous/public table access is revoked. Security events remain non-user-editable.
- No realtime guarantee exists in Phase 3. Another browser may need a refresh to see a committed change.
