# AWN Settings v1

Settings is one authenticated `/settings` page with Plan, Preferences, Account & Security, and Data & Privacy sections.

- **Plan settings are Household-scoped:** `households.name` remains the plan name; base currency, budget start day, custom categories, and financial data remain in the canonical Household financial profile.
- **Preferences are user-scoped:** display name, currency placement, number format, and date format live in `user_preferences` under user-only RLS.
- **Currency has no FX conversion:** an empty plan may change its base currency. AWN blocks the change after meaningful financial activity exists rather than relabeling history.
- **Export is JSON v1:** it contains the active Household plan and financial profile, never authentication credentials, tokens, or Supabase secrets.
- **Clear financial data is destructive:** the focused owner-only RPC clears financial content and SMS-import fingerprints atomically, retains the Auth account, Household, plan name, base currency, budget cycle, and personal preferences, then restarts onboarding. It is blocked when the Household has more than one member.
- **Delete account is deferred:** Auth-account deletion and Household ownership semantics will be designed with Shared Budgeting.

Custom category rename/migration is intentionally not included because current financial history stores category names as strings. Used custom categories cannot be removed; unused custom suggestions can be deleted.
