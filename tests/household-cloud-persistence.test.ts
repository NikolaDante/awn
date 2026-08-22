import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cloudWinsOverLocal, decideInitialCloudState, LOCAL_CLOUD_MIGRATION_IDENTIFIER, parseCloudStateRow } from "../lib/cloud-financial-core.ts";
import { calculateActualSummary } from "../lib/financial-calculations.ts";
import { cloudMigrationBackupKey, isFinancialProfile } from "../lib/financial-storage-core.ts";
import type { FinancialProfile } from "../lib/financial-types.ts";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260822000000_household_financial_persistence.sql"), "utf8");
const repository = readFileSync(join(process.cwd(), "lib/cloud-financial-repository.ts"), "utf8");
const provider = readFileSync(join(process.cwd(), "components/financial-provider.tsx"), "utf8");
const localStorageAdapter = readFileSync(join(process.cwd(), "lib/financial-storage.ts"), "utf8");

function migrationProfile(): FinancialProfile {
  return {
    version: 2,
    country: "United Arab Emirates",
    currency: "AED",
    budgetStartDay: 25,
    monthlyBudget: 300000,
    monthlyBudgets: [{ month: "2026-07", limit: 275000 }, { month: "2026-08", limit: 300000 }],
    cashBalance: 20000,
    incomeSources: [{ id: "salary", name: "Salary", amount: 1000000, day: 25 }],
    accounts: [
      { id: "account-main", name: "Main account", type: "current", purpose: "Salary", balance: 500000, country: "United Arab Emirates", currency: "AED", lastFour: "1234" },
      { id: "account-savings", name: "Savings account", type: "savings", balance: 100000, country: "United Arab Emirates", currency: "AED" },
    ],
    debitCards: [{ id: "debit-main", name: "Main debit", country: "United Arab Emirates", currency: "AED", lastFour: "4321", linkedAccountId: "account-main" }],
    creditCards: [{ id: "credit-main", name: "Main credit", purpose: "Groceries", limit: 1000000, owed: 12000, dueDay: 12, country: "United Arab Emirates", currency: "AED" }],
    categoryBudgets: [
      { id: "budget-july", name: "Groceries", limit: 100000, month: "2026-07" },
      { id: "budget-august", name: "Groceries", limit: 125000, month: "2026-08" },
    ],
    savingsGoals: [{ id: "goal", name: "Emergency fund", target: 2000000, saved: 300000, contribution: 100000, startDate: "2026-08-01", targetDate: "2027-12-01", priority: 1 }],
    onboarding: { currentStep: 6, completed: true },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
    transactions: [
      { id: "income", type: "income", amount: 1000000, date: "2026-08-25", incomeSourceId: "salary", incomeSourceName: "Salary", destinationAccountId: "account-main", createdAt: "2026-08-25T08:00:00.000Z", updatedAt: "2026-08-25T08:00:00.000Z" },
      { id: "expense", type: "expense", amount: 12000, date: "2026-08-26", category: "Groceries", cardId: "credit-main", createdAt: "2026-08-26T08:00:00.000Z", updatedAt: "2026-08-26T08:00:00.000Z" },
      { id: "transfer", type: "transfer", amount: 50000, date: "2026-08-27", sourceAccountId: "account-main", destinationAccountId: "account-savings", createdAt: "2026-08-27T08:00:00.000Z", updatedAt: "2026-08-27T08:00:00.000Z" },
    ],
  };
}

test("cloud state maps the complete Phase 2 profile without changing financial meaning", () => {
  const profile = migrationProfile();
  assert.equal(isFinancialProfile(profile), true);
  const parsed = parseCloudStateRow([{ household_id: "household-a", household_name: "My Household", member_role: "owner", profile_data: JSON.parse(JSON.stringify(profile)), revision: 4, initialized_at: "2026-08-22T00:00:00Z", migrated_at: "2026-08-22T00:00:00Z" }]);
  assert.deepEqual(parsed.profile, profile);
  assert.equal(parsed.profile?.budgetStartDay, 25);
  assert.equal(parsed.profile?.cashBalance, 20000);
  assert.equal(parsed.profile?.debitCards?.[0].linkedAccountId, "account-main");
  assert.equal(parsed.profile?.transactions[2].type, "transfer");
  assert.deepEqual(parsed.profile?.categoryBudgets.map((item) => item.month), ["2026-07", "2026-08"]);
  assert.deepEqual(parsed.profile?.monthlyBudgets, profile.monthlyBudgets);
  assert.equal(parsed.profile?.savingsGoals[0].targetDate, "2027-12-01");
  assert.deepEqual(calculateActualSummary(parsed.profile!, "2026-08"), calculateActualSummary(profile, "2026-08"));
});

test("initial-load policy migrates only an empty cloud profile and is idempotent", () => {
  const local = migrationProfile();
  assert.deepEqual(decideInitialCloudState(null, local, null), { kind: "migrate-local", profile: local });
  assert.deepEqual(decideInitialCloudState(null, null, null), { kind: "empty" });
  assert.equal(decideInitialCloudState(null, null, "corrupt").kind, "invalid-local");
  const populated = { ...local, cashBalance: 99900 };
  assert.deepEqual(decideInitialCloudState(populated, local, null), { kind: "cloud", profile: populated });
  assert.equal(cloudWinsOverLocal(populated), true);
  assert.equal(cloudWinsOverLocal(null), false);
  assert.equal(LOCAL_CLOUD_MIGRATION_IDENTIFIER, "authenticated-local-profile-v2");
  assert.equal(cloudMigrationBackupKey("user-a"), "awn.financial.profile.cloud-migration-backup.v2:user-a");
});

test("migration creates a secure Household membership boundary and atomic profile RPC", () => {
  assert.match(migration, /create table public\.households[\s\S]*?created_by uuid references auth\.users\(id\) on delete set null/);
  assert.match(migration, /create table public\.household_members[\s\S]*?primary key \(household_id, user_id\)/);
  assert.match(migration, /role text not null check \(role in \('owner', 'member'\)\)/);
  assert.match(migration, /alter table public\.financial_profiles[\s\S]*?add column household_id uuid/);
  for (const table of ["financial_profiles", "income_sources", "accounts", "credit_cards", "budget_categories", "savings_goals", "transactions"]) {
    assert.match(migration, new RegExp(`Members select household [^\n]+\" on public\\.${table}[\\s\\S]*?private\\.awn_is_household_member\\(household_id`));
  }
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /if not private\.awn_is_household_member\(p_household_id, v_user_id\)/);
  assert.match(migration, /where profile\.household_id = p_household_id for update/);
  assert.match(migration, /profile\.revision is distinct from p_expected_revision/);
  assert.match(migration, /profile_data = v_profile_data[\s\S]*?revision = profile\.revision \+ 1/);
  assert.match(migration, /createdByUserId[\s\S]*?updatedByUserId/);
  assert.doesNotMatch(migration, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|service_role|postgres(?:ql)?:\/\//i);
});

test("membership creation is internal while members have read and atomic write foundations", () => {
  assert.match(migration, /revoke all on table public\.households, public\.household_members from public, anon, authenticated/);
  assert.doesNotMatch(migration, /create policy[^;]+household_members for insert to authenticated/i);
  assert.doesNotMatch(migration, /create policy[^;]+households for insert to authenticated/i);
  assert.match(migration, /grant execute on function public\.awn_resolve_personal_household\(\) to authenticated/);
  assert.match(migration, /grant execute on function public\.awn_save_financial_state\(uuid, bigint, jsonb, text\) to authenticated/);
  assert.match(migration, /revoke execute on all functions in schema public from authenticated/);
  assert.match(migration, /on delete set null/);
});

test("the provider uses Supabase as source of truth and retains a one-time local migration backup", () => {
  assert.match(provider, /loadCloudFinancialProfile\(ownerId\)/);
  assert.match(provider, /await saveCloudFinancialProfile\(cloudRef\.current, updated\)/);
  assert.doesNotMatch(provider, /saveFinancialProfile|resetFinancialProfile|localStorage/);
  assert.match(repository, /if \(cloud\.profile\) return/);
  assert.ok(repository.indexOf("if (cloud.profile) return") < repository.indexOf("loadFinancialProfile(ownerId)"));
  assert.match(repository, /backupFinancialProfileForCloudMigration\(ownerId\)/);
  const backup = localStorageAdapter.match(/export function backupFinancialProfileForCloudMigration[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(backup, /cloudMigrationBackupKey\(ownerId\)/);
  assert.match(backup, /if \(!window\.localStorage\.getItem\(key\)\) window\.localStorage\.setItem\(key, source\)/);
  assert.doesNotMatch(backup, /removeItem/);
});
