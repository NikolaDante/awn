import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { recoveryFormAllowed, signupNeedsConfirmation } from "../lib/auth/state.ts";
import { budgetSummary, categoryBudgetPosition, normalizeBudgetSnapshots, overallBudgetForMonth, replaceOverallBudgetSnapshot } from "../lib/financial-budget.ts";
import { setCurrentCashBalance, transferValidationMessage } from "../lib/financial-ledger.ts";
import { deleteSavingsGoal, savingsGoalTotals, upsertSavingsGoal } from "../lib/financial-savings.ts";
import { isFinancialProfile } from "../lib/financial-storage-core.ts";
import { createFinancialProfile, type SavingsGoal, type Transaction } from "../lib/financial-types.ts";

const root = process.cwd();
const viewsSource = readFileSync(join(root, "components/finance-app-views.tsx"), "utf8");
const authSource = readFileSync(join(root, "components/auth-forms.tsx"), "utf8");
const callbackSource = readFileSync(join(root, "app/auth/callback/route.ts"), "utf8");

test("overall budget remains independent from category allocation totals", () => {
  const profile = createFinancialProfile();
  profile.monthlyBudget = 300000;
  profile.monthlyBudgets = [{ month: "2026-08", limit: 300000 }];
  profile.categoryBudgets = [
    { id: "housing", name: "Housing", limit: 50000, month: "2026-08" },
    { id: "groceries", name: "Groceries", limit: 40000, month: "2026-08" },
    { id: "transport", name: "Transport", limit: 30000, month: "2026-08" },
  ];
  const summary = budgetSummary(profile, "2026-08", 65000);
  assert.deepEqual({ budget: summary.budget, allocated: summary.allocated, unallocated: summary.unallocated, remaining: summary.remaining }, { budget: 300000, allocated: 120000, unallocated: 180000, remaining: 235000 });
  assert.equal(categoryBudgetPosition(40000, 25000).difference, 15000);
  assert.equal(categoryBudgetPosition(0, 5000).statusLabel, "Unbudgeted spend");
});

test("period-specific overall snapshots survive current-period edits", () => {
  const profile = createFinancialProfile();
  profile.monthlyBudget = 300000;
  profile.monthlyBudgets = [{ month: "2026-07", limit: 250000 }, { month: "2026-08", limit: 300000 }];
  const updated = replaceOverallBudgetSnapshot(profile, "2026-08", 325000);
  assert.equal(overallBudgetForMonth(updated, "2026-07"), 250000);
  assert.equal(overallBudgetForMonth(updated, "2026-08"), 325000);
});

test("legacy overall budget backfills known historical periods once", () => {
  const profile = createFinancialProfile();
  profile.monthlyBudget = 300000;
  profile.transactions = [{ id: "old", type: "expense", category: "Other", amount: 1000, date: "2026-07-10", createdAt: "2026-07-10T08:00:00Z", updatedAt: "2026-07-10T08:00:00Z" } as Transaction];
  const normalized = normalizeBudgetSnapshots(profile, "2026-08");
  assert.equal(overallBudgetForMonth(normalized, "2026-07"), 300000);
  assert.equal(overallBudgetForMonth(normalized, "2026-08"), 300000);
});

test("first overall budget can be created and edited with zero categories", () => {
  const profile = createFinancialProfile();
  const created = replaceOverallBudgetSnapshot(profile, "2026-08", 100000);
  assert.equal(created.categoryBudgets.length, 0);
  assert.equal(budgetSummary(created, "2026-08", 0).unallocated, 100000);
  assert.equal(isFinancialProfile(created), true);
  const edited = replaceOverallBudgetSnapshot(created, "2026-08", 125000);
  assert.equal(overallBudgetForMonth(edited, "2026-08"), 125000);
  assert.equal(edited.categoryBudgets.length, 0);
});

test("savings goals support full replacement, deletion, and dashboard totals", () => {
  const profile = createFinancialProfile();
  const original: SavingsGoal = { id: "goal", name: "Emergency Fund", target: 2000000, saved: 500000, contribution: 100000, targetDate: "2027-12-01", priority: 2 };
  const edited: SavingsGoal = { ...original, name: "Emergency Reserve", target: 2500000, saved: 600000, contribution: 125000, targetDate: "2028-06-01", priority: 3 };
  const created = upsertSavingsGoal(profile, original);
  const updated = upsertSavingsGoal(created, edited);
  assert.deepEqual(updated.savingsGoals, [edited]);
  assert.deepEqual(savingsGoalTotals(updated), { saved: 600000, target: 2500000 });
  const deleted = deleteSavingsGoal(updated, edited.id);
  assert.deepEqual(deleted.savingsGoals, []);
  assert.deepEqual(savingsGoalTotals(deleted), { saved: 0, target: 0 });
  assert.deepEqual({ accounts: deleted.accounts, cash: deleted.cashBalance, transactions: deleted.transactions }, { accounts: profile.accounts, cash: profile.cashBalance, transactions: profile.transactions });
});

test("empty financial states stay neutral and avoid invented insight claims", () => {
  const profile = createFinancialProfile();
  assert.deepEqual(budgetSummary(profile, "2026-08", 0), { budget: null, allocated: 0, unallocated: null, spent: 0, remaining: null, percent: null, kind: "none", tone: "neutral", statusLabel: "No budget" });
  assert.match(viewsSource, /No monthly budget yet/);
  assert.match(viewsSource, /Add a budget and a few transactions to unlock meaningful insights/);
  assert.doesNotMatch(viewsSource, /comfortably on track|Every category is within budget|Spending leads this month/);
  assert.match(viewsSource, /goals\.length === 1 \? "goal" : "goals"/);
});

test("cash and transfer validation return specific actionable messages", () => {
  const cash = setCurrentCashBalance(createFinancialProfile(), -100);
  assert.deepEqual(cash, { ok: false, error: "Cash balance cannot be below zero." });
  assert.equal(transferValidationMessage("", "cash:"), "Choose where the transfer is coming from.");
  assert.equal(transferValidationMessage("cash:", ""), "Choose where the transfer is going.");
  assert.equal(transferValidationMessage("cash:", "cash:"), "Choose different From and To balances.");
  assert.equal(transferValidationMessage("cash:", "account:one"), null);
});

test("auth state follows the actual signup session and guards reset access", () => {
  assert.equal(signupNeedsConfirmation({ access_token: "present" }), false);
  assert.equal(signupNeedsConfirmation(null), true);
  assert.equal(recoveryFormAllowed(true, true), true);
  assert.equal(recoveryFormAllowed(true, false), false);
  assert.equal(recoveryFormAllowed(false, true), false);
  assert.match(authSource, /signupNeedsConfirmation\(data\.session\)/);
  assert.match(authSource, /getSession\(\)/);
  assert.match(callbackSource, /cookies\.set\("awn-recovery", "verified"/);
});
