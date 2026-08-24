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
- aggregate, opted-in category spending
- shared savings goals and intentional shared savings contributions

**Household membership never grants access to another member’s private financial records.** Private financial RLS is based on the immutable `households.created_by` identity, not the transferable shared-management role.

Dashboard, Transactions, History, Cards & Accounts, Insights, SMS import, and the Private Plan view always resolve the authenticated user’s own private plan. `user_preferences.active_household_id` is retained only for database compatibility; it is no longer a financial authorization or application-context input. There is no global Household switcher. The `Private | Household` selector exists only on Plan.

## Aggregate spending

Expense Add/Edit offers `Include in household budget` only when the user has a partner. It is **OFF by default**. When enabled, the user chooses a Household category. A private mapping stores the source transaction identifier, contributor, amount, shared period, and category. Only the contributor may directly select their mapping rows. Other members receive category totals through the narrow `awn_get_shared_budget_summary` security-definer RPC; it never returns transaction IDs, dates, merchants, notes, instruments, SMS metadata, or balances.

Saving a private profile rebuilds that user’s mappings atomically. Amount/category edits update aggregates, disabling inclusion removes the mapping, deleting the expense removes the mapping, and clearing private data removes all of the caller’s mappings. Shared budgets and savings goals remain.

## Shared savings and attribution

Both members can create, edit, and delete shared goals and add shared contributions. Shared contribution records contain only amount, contributor, and time; they do not point to a private account, card, or transaction. Attribution is shown only for intentional shared actions such as a goal update or savings contribution.

## Invitations and management

Invitations remain case-insensitively bound to the authenticated Supabase email, expire after seven days, and store only a SHA-256 token hash. Preview links are manually shared from `https://awn-preview-awn4.vercel.app`; transactional invitation email remains deferred.

Both Owner and Member may edit shared planning. Owner-only relationship operations remain invite, revoke, remove, and transfer ownership. Transfer changes shared administration only and never transfers private finances. Remove or leave revokes shared-plan access without changing either user’s private data.

Realtime publishes only the shared-plan settings revision. Shared mutations and private opted-in expense changes bump that revision so the partner refetches aggregate planning data without receiving a private transaction event or payload.
