# Shared Households v1

AWN treats a Household as a financial plan. Shared Households v1 supports one Owner and one Member. Both can use the Household’s accounts, cards, transactions, budgets, savings goals, History, Insights, exports, and Bank SMS import. Owner-only operations are inviting or removing the Member, revoking invitations, transferring ownership, and renaming the plan.

Each user keeps their personal Household. Accepting an invitation only adds a membership and changes the user’s active Household; it never moves, copies, merges, or changes financial rows in either Household. The active selection is stored in `user_preferences.active_household_id`, revalidated against membership on every load, and falls back to an owned Household first.

Invitations are bound case-insensitively to the authenticated Supabase email, expire after seven days, and store only a SHA-256 token hash. Preview invitation links are manually shared from `https://awn-preview-awn4.vercel.app`; automatic transactional email is deferred. A signed-out invitee can use password or Google authentication and return to the same `/invite/<token>` route.

Members may leave and immediately return to an accessible personal Household. Owners remove Members without affecting either person’s personal Household. An Owner with a Member cannot leave until ownership is transferred; transfer atomically leaves exactly one Owner and reclassifies the transferred plan as shared so the former Owner can receive a clean personal fallback if they later leave. Household deletion is not included.

Financial state remains protected by Household-member RLS and the existing atomic profile RPC. Realtime listens only to the active Household’s profile, membership, and name changes, debounces events for 300 ms, and refetches the canonical snapshot. Switching clears the previous snapshot before loading the next Household so financial values cannot appear under the wrong name.
