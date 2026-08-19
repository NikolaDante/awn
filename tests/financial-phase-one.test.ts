import assert from "node:assert/strict";
import test from "node:test";
import { budgetCategoriesForMonth, categoryBudgetPosition, hasBudgetSnapshot, monthlyBudgetPosition, normalizeBudgetSnapshots, replaceBudgetSnapshot } from "../lib/financial-budget.ts";
import { calculateActualSummary, normalizeMoneyDraft, parseMoney } from "../lib/financial-calculations.ts";
import { financialReferenceDate } from "../lib/financial-date.ts";
import { savingsGoalStatus } from "../lib/financial-goal-status.ts";
import { readPlanViewState } from "../lib/financial-navigation.ts";
import { FINANCIAL_PURPOSE_MAX_LENGTH, normalizeFinancialPurpose, normalizeFinancialPurposes } from "../lib/financial-purpose.ts";
import { qaFinancialProfile } from "../lib/financial-qa-fixture.ts";
import { isFinancialProfile } from "../lib/financial-storage-core.ts";
import { filterTransactions } from "../lib/financial-transaction-filters.ts";
import { createFinancialProfile, type FinancialProfile, type SavingsGoal, type Transaction } from "../lib/financial-types.ts";

const transaction = (value: { id: string; type: Transaction["type"]; amount: number; date: string } & Record<string, unknown>): Transaction => ({ ...value, createdAt: `${value.date}T08:00:00Z`, updatedAt: `${value.date}T08:00:00Z` } as Transaction);

function snapshotProfile() {
  const profile = createFinancialProfile();
  profile.categoryBudgets = [
    { id: "jan-food", name: "Food", limit: 100000, month: "2026-01" },
    { id: "feb-food", name: "Food", limit: 200000, month: "2026-02" },
    { id: "mar-food", name: "Food", limit: 300000, month: "2026-03" },
  ];
  profile.transactions = [
    transaction({ id: "jan-expense", type: "expense", category: "Food", amount: 125000, date: "2026-01-10" }),
    transaction({ id: "feb-expense", type: "expense", category: "Food", amount: 150000, date: "2026-02-10" }),
  ];
  return profile;
}

test("editing March preserves January and February budget snapshots", () => {
  const profile = snapshotProfile();
  const january = structuredClone(budgetCategoriesForMonth(profile, "2026-01"));
  const february = structuredClone(budgetCategoriesForMonth(profile, "2026-02"));
  const updated = replaceBudgetSnapshot(profile, "2026-03", [{ id: "mar-food", name: "Food", limit: 450000 }]);
  assert.deepEqual(budgetCategoriesForMonth(updated, "2026-01"), january);
  assert.deepEqual(budgetCategoriesForMonth(updated, "2026-02"), february);
  assert.equal(budgetCategoriesForMonth(updated, "2026-03")[0].limit, 450000);
});

test("historical calculations use each month's own budget snapshot", () => {
  const profile = snapshotProfile();
  assert.equal(calculateActualSummary(profile, "2026-01").budgetRemaining.Food, -25000);
  assert.equal(calculateActualSummary(profile, "2026-02").budgetRemaining.Food, 50000);
});

test("legacy unscoped budgets migrate only into the active month", () => {
  const profile = createFinancialProfile();
  profile.categoryBudgets = [{ id: "food", name: "Food", limit: 100000 }];
  const normalized = normalizeBudgetSnapshots(profile, "2026-03");
  assert.equal(budgetCategoriesForMonth(normalized, "2026-03").length, 1);
  assert.equal(hasBudgetSnapshot(normalized, "2026-01"), false);
  assert.deepEqual(budgetCategoriesForMonth(normalized, "2026-01"), []);
});

test("average expense excludes income, transfers, card payments, and savings transfers", () => {
  const profile = createFinancialProfile();
  profile.categoryBudgets = [{ id: "food", name: "Food", limit: 200000, month: "2026-03" }];
  profile.transactions = [
    transaction({ id: "income", type: "income", amount: 1000000, date: "2026-03-01" }),
    transaction({ id: "cash-expense", type: "expense", category: "Food", amount: 60000, date: "2026-03-02" }),
    transaction({ id: "card-expense", type: "expense", category: "Food", cardId: "card", amount: 30000, date: "2026-03-03" }),
    transaction({ id: "other-expense", type: "expense", category: "Other", amount: 20000, date: "2026-03-04" }),
    transaction({ id: "account-transfer", type: "transfer", sourceAccountId: "one", destinationAccountId: "two", amount: 500000, date: "2026-03-05" }),
    transaction({ id: "savings-transfer", type: "transfer", sourceAccountId: "one", destinationAccountId: "savings", amount: 300000, date: "2026-03-06" }),
    transaction({ id: "card-payment", type: "card-payment", payingAccountId: "one", receivingCardId: "card", amount: 30000, date: "2026-03-07" }),
  ];
  const actual = calculateActualSummary(profile, "2026-03");
  assert.equal(actual.expenseCount, 3);
  assert.equal(actual.expenses, 110000);
  assert.equal(actual.averageExpense, 36667);
});

test("history budget wording distinguishes remaining, over, and exact positions", () => {
  assert.deepEqual(monthlyBudgetPosition(620000, 565000), { kind: "under", metricLabel: "Budget Remaining", statusLabel: "Under budget", tone: "good", difference: 55000 });
  assert.deepEqual(monthlyBudgetPosition(620000, 860000), { kind: "over", metricLabel: "Over Budget", statusLabel: "Over budget", tone: "over", difference: 240000 });
  assert.deepEqual(monthlyBudgetPosition(620000, 620000), { kind: "exact", metricLabel: "Budget Remaining", statusLabel: "On budget", tone: "good", difference: 0 });
});

test("zero-budget categories have neutral or unbudgeted semantics without a percentage", () => {
  assert.deepEqual(categoryBudgetPosition(0, 0), { kind: "no-budget", tone: "neutral", statusLabel: "No budget", differenceLabel: "Remaining", difference: 0, percent: null });
  assert.deepEqual(categoryBudgetPosition(0, 2500), { kind: "unbudgeted", tone: "over", statusLabel: "Unbudgeted spend", differenceLabel: "Over", difference: 2500, percent: null });
});

const goal = (saved: number, targetDate?: string): SavingsGoal => ({ id: "goal", name: "Goal", target: 100000, saved, contribution: 0, startDate: "2026-01-01", targetDate, priority: 1 });

test("savings goal status covers schedule and completion states deterministically", () => {
  const reference = "2026-07-01";
  assert.equal(savingsGoalStatus(goal(70000, "2027-01-01"), reference).label, "Ahead");
  assert.equal(savingsGoalStatus(goal(50000, "2027-01-01"), reference).label, "On track");
  assert.equal(savingsGoalStatus(goal(20000, "2027-01-01"), reference).label, "Behind");
  assert.equal(savingsGoalStatus(goal(95000, "2027-01-01"), reference).label, "Almost there");
  assert.equal(savingsGoalStatus(goal(100000, "2027-01-01"), reference).label, "Completed");
  assert.equal(savingsGoalStatus(goal(20000), reference).label, "In progress");
});

test("QA savings goals derive varied statuses from fixture dates", () => {
  const reference = financialReferenceDate(qaFinancialProfile);
  const statuses = Object.fromEntries(qaFinancialProfile.savingsGoals.map((item) => [item.name, savingsGoalStatus(item, reference, qaFinancialProfile.createdAt.slice(0, 10)).label]));
  assert.deepEqual(statuses, { "Emergency Fund": "Behind", "Vacation Fund": "Ahead", "New Car": "On track", "Home Deposit": "On track" });
});

test("QA month snapshots retain the reconciled budget story", () => {
  const expected = { "2026-01": 55000, "2026-02": -240000, "2026-03": 130000 };
  for (const [month, difference] of Object.entries(expected)) {
    const budget = budgetCategoriesForMonth(qaFinancialProfile, month).reduce((total, item) => total + item.limit, 0);
    assert.equal(budget, 620000);
    assert.equal(budget - calculateActualSummary(qaFinancialProfile, month).expenses, difference);
  }
});

test("profile fixtures remain structurally assignable after snapshot evolution", () => {
  const profile: FinancialProfile = structuredClone(qaFinancialProfile);
  assert.equal(profile.version, 2);
});

test("money drafts preserve natural sequential typing before parsing to cents", () => {
  const cases = { "1": 100, "15": 1500, "1500": 150000, "1500.": 150000, "1500.0": 150000, "1500.00": 150000, "37.25": 3725, "0.99": 99 };
  for (const [draft, cents] of Object.entries(cases)) {
    assert.equal(normalizeMoneyDraft(draft), draft);
    assert.equal(parseMoney(draft), cents);
  }
  assert.equal(normalizeMoneyDraft("."), "0.");
  assert.equal(normalizeMoneyDraft("12.345"), null);
  assert.equal(normalizeMoneyDraft("AED 12"), null);
  assert.equal(normalizeMoneyDraft(""), "");
});

test("Plan deep links still open the intended existing workflows", () => {
  assert.deepEqual(readPlanViewState({ tab: "savings", action: "add-goal" }), { tab: "savings", action: "add-goal" });
  assert.deepEqual(readPlanViewState({ tab: "budgets", action: "edit-budget" }), { tab: "budgets", action: "edit-budget" });
  assert.deepEqual(readPlanViewState({ tab: "unknown", action: "unknown" }), { tab: "budgets", action: undefined });
});

test("optional financial purposes normalize without breaking older profiles", () => {
  const legacyShape = createFinancialProfile();
  legacyShape.accounts = [{ id: "account", name: "Everyday", type: "current", balance: 100000 }];
  legacyShape.debitCards = [{ id: "debit", name: "Debit", country: "United Arab Emirates", currency: "AED", lastFour: "1234" }];
  legacyShape.creditCards = [{ id: "credit", name: "Credit", limit: 1000000, owed: 20000, dueDay: 12 }];
  assert.equal(isFinancialProfile(legacyShape), true);

  const withPurposes = normalizeFinancialPurposes({
    ...legacyShape,
    accounts: [{ ...legacyShape.accounts[0], purpose: "  Everyday   Expenses  " }],
    debitCards: [{ ...legacyShape.debitCards[0], purpose: "   " }],
    creditCards: [{ ...legacyShape.creditCards[0], purpose: "Backup" }],
  });
  assert.equal(withPurposes.accounts[0].purpose, "Everyday Expenses");
  assert.equal(withPurposes.debitCards?.[0].purpose, undefined);
  assert.equal(withPurposes.creditCards[0].purpose, "Backup");
  assert.equal(JSON.parse(JSON.stringify(withPurposes)).accounts[0].purpose, "Everyday Expenses");
  assert.equal(normalizeFinancialPurpose("x".repeat(40))?.length, FINANCIAL_PURPOSE_MAX_LENGTH);
  assert.deepEqual(calculateActualSummary(withPurposes, "2026-03"), calculateActualSummary(legacyShape, "2026-03"));
});

test("current-month transaction dialog filters title, category, account, and date", () => {
  const items = [
    transaction({ id: "groceries", type: "expense", category: "Groceries", note: "Market", accountId: "cash", amount: 1250, date: "2026-03-03" }),
    transaction({ id: "dining", type: "expense", category: "Dining", note: "Cafe", cardId: "visa", amount: 2200, date: "2026-03-04" }),
  ];
  const details = (item: Transaction) => ({ title: item.note ?? "", category: item.type === "expense" ? item.category : item.type, account: item.type === "expense" && item.cardId ? "Visa" : "Cash" });
  assert.deepEqual(filterTransactions(items, { type: "all", title: "mark", category: "Groceries", account: "Cash", date: "2026-03-03" }, details).map((item) => item.id), ["groceries"]);
  assert.deepEqual(filterTransactions(items, { type: "expense", title: "", category: "Dining", account: "Visa", date: "" }, details).map((item) => item.id), ["dining"]);
});
