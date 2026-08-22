import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { AWN_CATEGORY_CATALOG, categoryOptionGroups, DEFAULT_CATEGORY_NAMES, profileCategoryNames } from "../lib/financial-categories.ts";
import { budgetCategoriesForMonth, budgetDraftAllocation, budgetSummary, dashboardBudgetHeroState, overallBudgetForMonth, replaceManagedBudgetSnapshot } from "../lib/financial-budget.ts";
import { calculateActualSummary } from "../lib/financial-calculations.ts";
import { normalizeLedgerProfile, UNBUDGETED_CATEGORY } from "../lib/financial-ledger.ts";
import { createFinancialProfile, type Transaction } from "../lib/financial-types.ts";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");
const dashboardPlan = source("components/finance-app-views.tsx");
const manager = source("components/manage-monthly-budget-dialog.tsx");
const onboarding = source("components/onboarding-flow.tsx");
const transactions = source("components/transactions-ui.tsx");

test("Dashboard no-budget hero has one high-contrast value and no status", () => {
  const profile = createFinancialProfile();
  const empty = dashboardBudgetHeroState(budgetSummary(profile, "2026-08", 0));
  assert.deepEqual(empty, { label: "Monthly budget", amount: null, valueLabel: "No budget", statusLabel: null });
  const budgeted = replaceManagedBudgetSnapshot(profile, "2026-08", 100000, []);
  assert.deepEqual(dashboardBudgetHeroState(budgetSummary(budgeted, "2026-08", 25000)), { label: "Budget remaining", amount: 75000, valueLabel: null, statusLabel: "Under budget" });
  assert.match(dashboardPlan, /budgetHero\.statusLabel && <Status/);
  assert.match(source("app/globals.css"), /\.hero-balance-side \.is-no-budget strong \{\s*color:#fff/);
});

test("Dashboard View goals and View all share the AWN text-action language", () => {
  assert.match(dashboardPlan, /className="panel-text-action" href="\/plan\?tab=savings"/);
  assert.match(dashboardPlan, /className="text-button panel-text-action"[\s\S]*?>View all <AppIcon/);
});

test("managed budget supports total-only creation", () => {
  const created = replaceManagedBudgetSnapshot(createFinancialProfile(), "2026-08", 100000, []);
  assert.equal(overallBudgetForMonth(created, "2026-08"), 100000);
  assert.deepEqual(budgetCategoriesForMonth(created, "2026-08"), []);
  assert.deepEqual(budgetDraftAllocation(100000, []), { overall: 100000, allocated: 0, unallocated: 100000 });
});

test("managed budget creates, edits, adds, and removes independent allocations", () => {
  const profile = createFinancialProfile();
  const initial = [{ id: "groceries", name: "Groceries", limit: 20000 }, { id: "fuel", name: "Fuel", limit: 10000 }];
  const created = replaceManagedBudgetSnapshot(profile, "2026-08", 100000, initial);
  assert.deepEqual(budgetDraftAllocation(100000, initial), { overall: 100000, allocated: 30000, unallocated: 70000 });
  const editedCategories = [{ id: "groceries", name: "Groceries", limit: 25000 }, { id: "custom", name: "Pet care", limit: 15000 }];
  const edited = replaceManagedBudgetSnapshot(created, "2026-08", 120000, editedCategories);
  assert.equal(overallBudgetForMonth(edited, "2026-08"), 120000);
  assert.deepEqual(budgetCategoriesForMonth(edited, "2026-08").map(({ name, limit }) => ({ name, limit })), [{ name: "Groceries", limit: 25000 }, { name: "Pet care", limit: 15000 }]);
  assert.deepEqual(budgetDraftAllocation(120000, editedCategories), { overall: 120000, allocated: 40000, unallocated: 80000 });
});

test("changing only the overall budget does not rescale category allocations", () => {
  const profile = replaceManagedBudgetSnapshot(createFinancialProfile(), "2026-08", 100000, [{ id: "food", name: "Groceries", limit: 45000 }]);
  const before = budgetCategoriesForMonth(profile, "2026-08");
  const edited = replaceManagedBudgetSnapshot(profile, "2026-08", 120000, before);
  assert.deepEqual(budgetCategoriesForMonth(edited, "2026-08"), before);
  assert.equal(budgetSummary(edited, "2026-08", 0).unallocated, 75000);
});

test("over-allocation remains visible without changing the overall budget", () => {
  const categories = [{ id: "one", name: "Groceries", limit: 70000 }, { id: "two", name: "Rent", limit: 50000 }];
  assert.deepEqual(budgetDraftAllocation(100000, categories), { overall: 100000, allocated: 120000, unallocated: -20000 });
  assert.match(manager, /allocations exceed your overall monthly budget/);
  assert.match(manager, /overall budget will not increase automatically/);
});

test("the catalog exposes the requested AWN groups and unique stable entries", () => {
  assert.deepEqual(AWN_CATEGORY_CATALOG.map((group) => group.label), ["Food & Drink", "Shopping", "Entertainment", "Travel", "Transportation", "Services", "Health", "Other"]);
  for (const name of ["Groceries", "Coffee & Snacks", "General Shopping", "Movies & Events", "Other Travel", "Taxi & Ride Hailing", "Subscriptions", "Insurance", "Wellness"]) assert.ok((DEFAULT_CATEGORY_NAMES as readonly string[]).includes(name));
  const keys = AWN_CATEGORY_CATALOG.flatMap((group) => group.categories.map((category) => category.key));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(DEFAULT_CATEGORY_NAMES).size, DEFAULT_CATEGORY_NAMES.length);
  assert.equal((DEFAULT_CATEGORY_NAMES as readonly string[]).includes(UNBUDGETED_CATEGORY), false);
});

test("custom and legacy strings remain available without rewriting history", () => {
  const profile = createFinancialProfile();
  profile.categoryBudgets = [{ id: "legacy", name: "Housing", limit: 50000, month: "2026-07" }, { id: "custom", name: "Pet care", limit: 10000, month: "2026-08" }];
  profile.transactions = [{ id: "care", type: "expense", category: "Care", amount: 5000, date: "2026-07-10", sourceKind: "cash", createdAt: "2026-07-10T00:00:00Z", updatedAt: "2026-07-10T00:00:00Z" } as Transaction];
  assert.deepEqual(profileCategoryNames(profile), ["Care", "Housing", "Pet care"]);
  assert.deepEqual(categoryOptionGroups(profile).at(-1)?.categories.map((category) => category.name), ["Care", "Housing", "Pet care"]);
  assert.ok(categoryOptionGroups(profile, [], "Pet Care").flatMap((group) => group.categories.map((category) => category.name)).includes("Pet Care"));
  assert.equal(calculateActualSummary(profile, "2026-07").categorySpending.Care, 5000);
  const edited = replaceManagedBudgetSnapshot(profile, "2026-08", 100000, [{ id: "custom", name: "Pet care", limit: 15000 }]);
  assert.equal((edited.transactions[0] as Extract<Transaction, { type: "expense" }>).category, "Care");
  assert.equal(budgetCategoriesForMonth(edited, "2026-07")[0].name, "Housing");
});

test("blank expenses still normalize to the unbudgeted fallback", () => {
  const profile = createFinancialProfile();
  profile.transactions = [{ id: "blank", type: "expense", category: "", amount: 1000, date: "2026-08-01", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z" } as Transaction];
  const normalized = normalizeLedgerProfile(profile);
  assert.equal((normalized.transactions[0] as Extract<Transaction, { type: "expense" }>).category, UNBUDGETED_CATEGORY);
});

test("one shared catalog and one shared budget workflow power every entry point", () => {
  assert.match(onboarding, /<CategoryBudgetForm[^>]+profile=\{draft\}/);
  assert.match(transactions, /<CategorySelectOptions profile=\{profile\}/);
  assert.match(manager, /<CategoryBudgetForm[^>]+profile=\{profile\}/);
  assert.doesNotMatch(onboarding, /suggestedCategories/);
  assert.match(dashboardPlan, /<ManageMonthlyBudgetDialog profile=\{profile\}/);
  assert.match(manager, /replaceManagedBudgetSnapshot/);
});

test("zero allocations replace View all with Add category budgets", () => {
  assert.match(dashboardPlan, /allocatedCount > 0 \? <button[^>]+>View all category budgets/);
  assert.match(dashboardPlan, /Add category budgets/);
  assert.match(dashboardPlan, /allCategoriesOpen && categoryBudgets\.length > 0/);
});
