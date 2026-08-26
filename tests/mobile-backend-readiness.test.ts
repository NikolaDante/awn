import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(process.cwd(), "supabase/migrations/20260826000000_harden_private_financial_profile_validation.sql");
const migration = readFileSync(migrationPath, "utf8");
const volatilityRepair = readFileSync(join(process.cwd(), "supabase/migrations/20260826010000_profile_validator_volatility_repair.sql"), "utf8");
const saveMigration = readFileSync(join(process.cwd(), "supabase/migrations/20260825000000_privacy_first_shared_planning.sql"), "utf8");

test("mobile profile hardening is additive and preflights every stored profile before activation", () => {
  assert.match(migrationPath, /20260826000000_harden_private_financial_profile_validation\.sql$/);
  assert.match(migration, /create or replace function private\.awn_validate_profile_data_v2\(p_profile_data jsonb\)/);
  assert.match(migration, /select household_id, profile_data from public\.financial_profiles where profile_data is not null/);
  assert.ok(migration.indexOf("existing_financial_profile_failed_validation") < migration.indexOf("create or replace function private.awn_validate_profile_data(p_profile_data jsonb)"));
  assert.doesNotMatch(migration, /drop\s+(table|schema)|truncate\s+|delete\s+from\s+public\.financial_profiles/i);
  assert.match(volatilityRepair, /alter function private\.awn_validate_profile_data_v2\(jsonb\) stable/);
  assert.doesNotMatch(volatilityRepair, /create or replace|drop\s+|delete\s+|truncate\s+/i);
});

test("database validation covers canonical settings, entities, and currency-safe minor units", () => {
  for (const field of [
    "budgetStartDay", "usualMonthlyIncome", "monthlySavingsGuidance", "monthlyBudget", "cashBalance",
    "incomeSources", "accounts", "debitCards", "creditCards", "categoryBudgets", "monthlyBudgets",
    "customCategories", "savingsGoals", "onboarding", "transactions",
  ]) assert.match(migration, new RegExp(field));
  assert.match(migration, /9007199254740991/);
  assert.match(migration, /pg_catalog\.trunc\(v_value\) = v_value/);
  assert.match(migration, /group by identity\.entity_kind, identity\.entity_id[\s\S]*?having count\(\*\) > 1/);
  assert.match(migration, /group by item->>'month' having count\(\*\) > 1/);
});

test("transaction validation rejects malformed shapes and dangling references before ledger replay", () => {
  for (const transactionType of ["income", "expense", "transfer", "card-payment"]) assert.match(migration, new RegExp(transactionType));
  for (const reference of [
    "incomeSourceId", "destinationAccountId", "sourceAccountId", "destinationAccountId",
    "payingAccountId", "receivingCardId", "linkedAccountId", "householdBudget",
  ]) assert.match(migration, new RegExp(reference));
  assert.match(migration, /invalid_transaction_identity/);
  assert.match(migration, /invalid_transaction_import/);
  assert.match(migration, /order by value->>'date', value->>'createdAt', value->>'id'/);
  assert.match(migration, /message = 'invalid_ledger'/);
});

test("the hardened validator remains private and the authenticated save RPC still owns authorization and revisions", () => {
  assert.match(migration, /revoke all on function private\.awn_validate_profile_data\(jsonb\) from public, anon, authenticated/);
  assert.match(migration, /security invoker[\s\S]*?set search_path = ''/);
  assert.doesNotMatch(migration, /grant execute .*awn_validate_profile_data/i);
  assert.match(saveMigration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(saveMigration, /if not private\.awn_is_private_financial_owner\(p_household_id, v_user_id\)/);
  assert.match(saveMigration, /profile\.revision is distinct from p_expected_revision/);
  assert.match(saveMigration, /perform private\.awn_validate_profile_data\(p_profile_data\)/);
  assert.doesNotMatch(`${migration}\n${saveMigration}`, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|service_role|postgres(?:ql)?:\/\//i);
});
