import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { invitationLink, parseHouseholdMembers, parseInvitationPreview, sharedHouseholdError } from "../lib/shared-households.ts";
import { parseSharedBudget, parseSharedPlan, parseSharedSavingsGoals } from "../lib/shared-planning.ts";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = source("supabase/migrations/20260825000000_privacy_first_shared_planning.sql");
const provider = source("components/financial-provider.tsx");
const repository = source("lib/cloud-financial-repository.ts");
const navigation = source("components/app-navigation.tsx");
const plan = source("components/finance-app-views.tsx");
const sharedPlan = source("components/shared-plan-view.tsx");
const transactions = source("components/transactions-ui.tsx");
const settings = source("components/settings-view.tsx");
const invite = source("components/household-invitation-view.tsx");

test("member summaries and invitation previews remain narrow", () => {
  assert.deepEqual(parseHouseholdMembers([{ user_id: "a", display_name: "Ana", email: "ana@example.com", role: "member", is_current_user: true, balance: 999 }]), [{ userId: "a", displayName: "Ana", email: "ana@example.com", role: "member", isCurrentUser: true }]);
  assert.deepEqual(parseInvitationPreview([{ household_name: "Shared", invited_by: "Nikola", invitation_status: "pending", expires_at: "2026-08-31T00:00:00Z", is_authenticated: true, email_matches: false, transaction: "private" }]), { householdName: "Shared", invitedBy: "Nikola", status: "pending", expiresAt: "2026-08-31T00:00:00Z", authenticated: true, emailMatches: false });
  assert.equal(invitationLink("secure token"), "https://awn-preview-awn4.vercel.app/invite/secure%20token");
});

test("shared planning parsers discard unexpected private fields", () => {
  assert.deepEqual(parseSharedPlan([{ household_id: "h", shared_plan_name: "Together", member_role: "owner", member_count: 2, currency: "AED", budget_start_day: 1, revision: 4, updated_at: "2026-08-24T00:00:00Z", account_balance: 999 }]), { householdId: "h", name: "Together", role: "owner", memberCount: 2, currency: "AED", budgetStartDay: 1, revision: 4, updatedAt: "2026-08-24T00:00:00Z" });
  assert.deepEqual(parseSharedBudget([{ period_key: "2026-08", overall_budget_minor: 200000, total_spent_minor: 35000, category: "Groceries", allocated_minor: 100000, spent_minor: 35000, updated_by_name: "Nikola", updated_at: "2026-08-24T00:00:00Z", source_private_transaction_id: "must-not-pass" }], "2026-08"), { periodKey: "2026-08", overallBudget: 200000, totalSpent: 35000, categories: [{ category: "Groceries", allocated: 100000, spent: 35000 }], updatedBy: "Nikola", updatedAt: "2026-08-24T00:00:00Z" });
  assert.equal(parseSharedSavingsGoals([{ goal_id: "g", name: "Holiday", target_minor: 1000000, saved_minor: 150000, planned_contribution_minor: 10000, target_date: "2027-06-01", priority: 1, updated_by_name: "Ana", updated_at: "2026-08-24T00:00:00Z", latest_contribution_minor: 50000, latest_contribution_by: "Ana", latest_contribution_at: "2026-08-24T00:00:00Z", account_id: "private" }])[0]?.latestContribution?.addedBy, "Ana");
});

test("immutable creator identity owns private finances and membership does not", () => {
  assert.match(migration, /awn_is_private_financial_owner[\s\S]*household\.created_by = p_user_id/);
  for (const table of ["financial profile", "income sources", "accounts", "credit cards", "categories", "savings goals", "transactions", "migration records", "security events", "import fingerprints"]) {
    assert.match(migration, new RegExp(`Owners select private ${table}`));
  }
  assert.match(migration, /drop policy if exists "Members select household financial profile"/);
  assert.doesNotMatch(migration.match(/create policy "Owners select private financial profile"[^;]+;/)?.[0] ?? "", /awn_is_household_member/);
});

test("private provider ignores active Household selection and contains no switch logic", () => {
  assert.match(repository, /rpc\("awn_resolve_private_household"\)/);
  assert.match(provider, /privatePlanHouseholdId/);
  assert.doesNotMatch(provider, /switchHousehold|activeHouseholdId|listHouseholds/);
  assert.doesNotMatch(navigation, /HouseholdSwitcher|household-switcher/);
  assert.equal(existsSync(join(process.cwd(), "components/household-switcher.tsx")), false);
  assert.match(migration, /active_household_id is retained for compatibility/);
  assert.match(migration, /longer a financial authorization or routing input/);
});

test("Plan is the only private/Household planning switch", () => {
  assert.match(plan, /aria-label="Plan privacy"/);
  assert.match(plan, />Private</);
  assert.match(plan, />Household</);
  assert.match(plan, /<SharedPlanView tab=\{tab\}/);
  assert.match(sharedPlan, /Your accounts and transactions stay private\. Only shared planning totals are visible here\./);
  assert.match(sharedPlan, /Plan together with someone/);
});

test("expense Household inclusion is optional, aggregate-only, and off by default", () => {
  assert.match(transactions, /useState\(!!editingHouseholdBudget\?\.included\)/);
  assert.match(transactions, /Include in household budget/);
  assert.match(transactions, /Only the category total and amount contribute to shared planning/);
  assert.match(transactions, /householdBudget: includeInHousehold && sharedPlan/);
  assert.match(migration, /Contributors select only own private mappings[\s\S]*contributed_by_user_id = auth\.uid\(\)/);
  const aggregate = migration.match(/create or replace function public\.awn_get_shared_budget_summary[\s\S]*?\nend;\n\$\$;/)?.[0] ?? "";
  assert.doesNotMatch(aggregate, /source_private_transaction_id|note|merchant|account_id|card_id|sms/i);
});

test("private save atomically rebuilds contribution mappings for edit and delete", () => {
  assert.match(migration, /awn_sync_shared_budget_contributions[\s\S]*delete from public\.shared_budget_contributions[\s\S]*jsonb_array_elements/);
  assert.match(migration, /perform private\.awn_sync_shared_budget_contributions\(p_household_id, v_user_id, v_profile_data\)/);
  assert.match(migration, /awn_clear_financial_data[\s\S]*awn_sync_shared_budget_contributions\(p_household_id,v_user_id,v_empty\)/);
  assert.match(migration, /shared_planning_member_departure/);
});

test("shared budgets and savings are collaborative while relationship management stays owner-only", () => {
  assert.match(migration, /awn_save_shared_budget[\s\S]*awn_is_household_member/);
  assert.match(migration, /awn_save_shared_savings_goal[\s\S]*awn_is_household_member/);
  assert.match(migration, /awn_add_shared_savings_contribution[\s\S]*created_by_user_id/);
  assert.match(settings, /plan\.role === "owner"[\s\S]*Invite partner/);
  assert.match(settings, /Transfer ownership/);
  assert.match(settings, /Private finances did not move/);
  assert.match(settings, /lose access to the shared budgets and savings goals/);
  assert.match(settings, /neither person’s private finances will move or change/);
  assert.doesNotMatch(settings, /lose access to this Household’s financial data/);
});

test("invitation copy promises planning only and explicitly states privacy", () => {
  assert.match(invite, /plan budgets and savings goals together/);
  assert.match(invite, /personal accounts, cards, transactions and balances remain private/);
  assert.doesNotMatch(invite, /manage this Household’s accounts/);
  assert.match(migration, /token_hash=v_hash/);
});

test("shared realtime invalidates via settings revision without publishing mappings", () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.shared_plan_settings/);
  assert.doesNotMatch(migration, /alter publication supabase_realtime add table public\.shared_budget_contributions/);
  assert.match(sharedPlan, /table: "shared_plan_settings"/);
  assert.doesNotMatch(sharedPlan, /table: "shared_budget_contributions"/);
});

test("clear private data remains available with a partner and preserves shared records", () => {
  assert.match(settings, /Clear private data/);
  assert.doesNotMatch(settings, /disabled=\{memberCount > 1\}/);
  const clear = migration.match(/create or replace function public\.awn_clear_financial_data[\s\S]*?\nend; \$\$;/)?.[0] ?? "";
  assert.doesNotMatch(clear, /delete from public\.shared_(monthly_budgets|budget_allocations|savings_goals|savings_contributions)/);
});

test("stable security and invitation error behavior remains documented", () => {
  assert.match(sharedHouseholdError("invitation_email_mismatch"), /another email/);
  assert.match(sharedHouseholdError("household_member_limit"), /two members/);
  const documentation = source("docs/SHARED-HOUSEHOLDS.md");
  assert.match(documentation, /Household membership never grants access/);
  assert.match(documentation, /OFF by default/);
  assert.match(documentation, /seven days/);
});
