# Privacy-first Shared Planning

AWN supports one Household Owner and one Member using the existing email-bound invitation and membership system. A shared relationship provides collaborative planning, not shared financial access.

## Permanent privacy boundary

Private to each user:

- accounts, debit cards, credit cards, and cash
- transactions and History
- private monthly budgets and private savings goals
- Dashboard and Insights
- Bank SMS imports, metadata, and fingerprints

Shared with the Household:

- shared plan name, currency, and budget-cycle start day
- shared overall monthly budgets and category allocations
- per-member category responsibility amounts and each member's opted-in aggregate spending
- aggregate, opted-in category spending
- shared savings goals and intentional shared savings contributions

**Household membership never grants access to another member’s private financial records.** Private financial RLS is based on the immutable `households.created_by` identity, not the transferable shared-management role.

Dashboard, Transactions, History, Cards & Accounts, Insights, SMS import, and the Private Plan view always resolve the authenticated user’s own private plan. `user_preferences.active_household_id` is retained only for database compatibility; it is no longer a financial authorization or application-context input. There is no global Household switcher. The `Private | Household` selector exists only on Plan.

## Aggregate spending

Expense Add/Edit offers `Include in household budget` only when the user has a partner. It is **OFF by default**. When enabled, the user chooses a Household category. A private mapping stores the source transaction identifier, contributor, amount, shared period, and category. Only the contributor may directly select their mapping rows. Other members receive category and member totals through the narrow `awn_get_shared_budget_responsibilities` security-definer RPC; it never returns transaction IDs, dates, merchants, notes, instruments, SMS metadata, or balances.

Saving a private profile rebuilds that user’s mappings atomically. Amount/category edits update aggregates, disabling inclusion removes the mapping, deleting the expense removes the mapping, and clearing private data removes all of the caller’s mappings. Shared budgets and savings goals remain.

## Shared savings and attribution

Both members can create, edit, and delete shared goals and add shared contributions. Shared contribution records contain only amount, contributor, and time; they do not point to a private account, card, or transaction. Attribution is shown only for intentional shared actions such as a goal update or savings contribution.

## Invitations and management

Invitations remain case-insensitively bound to the authenticated Supabase email, expire after seven days, and store only a SHA-256 token hash. Preview links are manually shared from `https://awn-preview-awn4.vercel.app`; transactional invitation email remains deferred.

The underlying Household Owner is labelled **Budget Admin** in the product. Only the Budget Admin can change shared-plan settings, overall/category budgets, and member responsibility splits; this is enforced by the save RPC, not only the UI. Both members can view the same aggregate plan and continue to collaborate on shared savings goals and contributions. Responsibility allocations are planning metadata: they never change balances or create transactions.

Transfer changes the Budget Admin immediately while leaving existing allocations and both users' private finances unchanged. Remove or leave revokes shared-plan access without changing private data or silently reassigning responsibility. A membership change makes the current plan show `Needs adjustment` until the Budget Admin reviews valid two-member splits.

## Budget guide

Onboarding and the Private and Household budget editors reuse one client-only guide foundation. Balanced (50/30/20), Savings First (50/20/30), and Flexible (60/30/10) retain fixed percentages; Custom uses currency amounts that must reconcile exactly to the planning amount. Savings is deliberately excluded from the spending budget. Category and savings-goal suggestions remain local draft state until the user accepts and saves them through the existing persistence paths. Back and Cancel do not persist a draft.

Onboarding may store an optional `usualMonthlyIncome` inside the user's private financial profile JSON. It is a planning prefill only: it creates no Income transaction, changes no account or Cash balance, and is never returned by shared-plan or member-summary RPCs. The Household guide is available only to the Budget Admin, asks only for an amount to plan together, and never requests either partner's income.

At phone widths, AWN pages, cards, forms, selectors, dialogs, and sheets must resolve within the viewport after the standard mobile inset. Intrinsic form/control widths and grid or flex children must be constrained at their source; root clipping is defensive only. Responsive viewport metadata must preserve browser zoom.

Realtime publishes only the shared-plan settings revision. Shared mutations and private opted-in expense changes bump that revision so the partner refetches aggregate planning data without receiving a private transaction event or payload.
