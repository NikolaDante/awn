import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createFinancialProfile } from "../lib/financial-types.ts";
import { addCustomCategory, buildFinancialExport, clearConfirmationReady, customCategoryRemoval, hasMeaningfulFinancialData, validPlanName } from "../lib/settings.ts";
import { DEFAULT_USER_PREFERENCES, formatDatePreference, formatMoneyPreference, parseUserPreferences } from "../lib/user-preferences.ts";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

test("Settings ownership keeps plan data Household-scoped and preferences user-scoped", () => {
  const migration = source("supabase/migrations/20260824000000_settings_v1.sql");
  assert.match(migration, /create table public\.user_preferences[\s\S]*user_id uuid primary key references auth\.users\(id\)/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /awn_update_household_name\(p_household_id uuid, p_name text\)/);
  assert.doesNotMatch(migration, /plan_name|alter table public\.households[^;]*currency_placement/);
});

test("plan name and currency safety use the existing Household and canonical profile", () => {
  assert.equal(validPlanName("  My Finances  "), "My Finances");
  assert.equal(validPlanName("   "), null);
  assert.equal(validPlanName("a".repeat(61)), null);
  const empty = createFinancialProfile();
  assert.equal(hasMeaningfulFinancialData(empty), false);
  assert.equal(hasMeaningfulFinancialData({ ...empty, transactions: [{ id: "t", type: "expense", amount: 100, date: "2026-08-23", category: "Groceries", sourceKind: "cash", createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z" }] }), true);
});

test("currency placement and all fixed number formats are presentation-only", () => {
  const amount = 123456;
  assert.equal(formatMoneyPreference(amount, "AED", { ...DEFAULT_USER_PREFERENCES, currencyPlacement: "before", numberFormat: "comma-dot" }), "AED 1,234.56");
  assert.equal(formatMoneyPreference(amount, "AED", { ...DEFAULT_USER_PREFERENCES, currencyPlacement: "after", numberFormat: "comma-dot" }), "1,234.56 AED");
  assert.equal(formatMoneyPreference(amount, "AED", { ...DEFAULT_USER_PREFERENCES, currencyPlacement: "after", numberFormat: "dot-comma" }), "1.234,56 AED");
  assert.equal(formatMoneyPreference(amount, "AED", { ...DEFAULT_USER_PREFERENCES, currencyPlacement: "after", numberFormat: "space-comma" }), "1 234,56 AED");
  assert.equal(amount, 123456);
});

test("all fixed date formats preserve canonical stored dates", () => {
  const stored = "2026-08-23";
  assert.equal(formatDatePreference(stored, "DD/MM/YYYY"), "23/08/2026");
  assert.equal(formatDatePreference(stored, "MM/DD/YYYY"), "08/23/2026");
  assert.equal(formatDatePreference(stored, "YYYY-MM-DD"), "2026-08-23");
  assert.equal(stored, "2026-08-23");
});

test("preference parsing accepts only the stable choices", () => {
  assert.deepEqual(parseUserPreferences({ display_name: "Nikola", currency_placement: "after", number_format: "dot-comma", date_format: "YYYY-MM-DD" }), { displayName: "Nikola", currencyPlacement: "after", numberFormat: "dot-comma", dateFormat: "YYYY-MM-DD" });
  assert.deepEqual(parseUserPreferences({ currency_placement: "invalid", number_format: "invalid", date_format: "invalid" }), DEFAULT_USER_PREFERENCES);
});

test("custom categories add safely and used or built-in categories cannot be deleted", () => {
  const empty = createFinancialProfile();
  const added = addCustomCategory(empty, "Pet care");
  assert.equal(added.error, null);
  assert.deepEqual(added.profile.customCategories, ["Pet care"]);
  assert.equal(customCategoryRemoval(added.profile, "Pet care").allowed, true);
  assert.equal(customCategoryRemoval(added.profile, "Groceries").allowed, false);
  assert.equal(customCategoryRemoval({ ...added.profile, categoryBudgets: [{ id: "b", name: "Pet care", limit: 1000 }] }, "Pet care").allowed, false);
});

test("JSON export contains the active plan without authentication secrets", () => {
  const profile = { ...createFinancialProfile(), accounts: [{ id: "a", name: "Main", type: "current" as const, balance: 10000 }] };
  const exported = buildFinancialExport("My Finances", profile, "2026-08-23T12:00:00.000Z");
  const json = JSON.stringify(exported);
  assert.equal(exported.exportVersion, 1);
  assert.equal(exported.plan.name, "My Finances");
  assert.equal(exported.financialData.accounts[0].balance, 10000);
  assert.doesNotMatch(json, /password|access_token|refresh_token|service_role|provider_token/i);
});

test("clear requires exact confirmation and the RPC is atomic and shared-member safe", () => {
  assert.equal(clearConfirmationReady("CLEAR"), true);
  assert.equal(clearConfirmationReady("clear"), false);
  const migration = source("supabase/migrations/20260824000000_settings_v1.sql");
  const clear = migration.match(/create function public\.awn_clear_financial_data[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(clear, /membership\.role = 'owner'/);
  assert.match(clear, /count\(\*\)[^]*> 1[^]*shared_household_clear_blocked/);
  assert.match(clear, /delete from public\.financial_import_fingerprints/);
  assert.match(clear, /'onboarding', jsonb_build_object\('currentStep', 0, 'completed', false\)/);
  assert.doesNotMatch(clear, /delete from public\.households|delete from auth\.users/);
});

test("Settings stays inside the persistent authenticated shell and exposes accessible navigation", () => {
  const nav = source("components/app-navigation.tsx"); const route = source("app/(financial)/(authenticated)/settings/page.tsx"); const layout = source("app/(financial)/layout.tsx");
  assert.match(nav, /href="\/settings" label="Settings" icon="settings"/);
  assert.match(route, /<SettingsView/);
  assert.match(layout, /<UserPreferencesProvider[^]*<FinancialProvider/);
});

test("main authenticated financial surfaces consume the shared user formatter", () => {
  for (const path of ["components/finance-app-views.tsx", "components/transactions-ui.tsx", "components/cards-accounts-view.tsx", "components/manage-monthly-budget-dialog.tsx", "components/animated-money.tsx"]) assert.match(source(path), /useUserPreferences/);
  const settings = source("components/settings-view.tsx");
  assert.match(settings, /auth\.updateUser\(\{ email:/);
  assert.match(settings, /auth\.updateUser\(\{ password \}\)/);
  assert.match(settings, /providers\.includes\("email"\)/);
});
