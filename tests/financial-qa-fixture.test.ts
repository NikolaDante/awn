import assert from "node:assert/strict";
import test from "node:test";
import { budgetCategoriesForMonth } from "../lib/financial-budget.ts";
import { calculateActualSummary, cardLedgerValid } from "../lib/financial-calculations.ts";
import { financialReferenceMonth } from "../lib/financial-date.ts";
import { qaCategoryCatalog, qaFinancialProfile } from "../lib/financial-qa-fixture.ts";
import { isFinancialProfile } from "../lib/financial-storage-core.ts";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const inMonth = (month: string) => qaFinancialProfile.transactions.filter((transaction) => transaction.date.startsWith(month));

test("QA profile uses the production profile shape and an isolated March reference month", () => {
  assert.equal(isFinancialProfile(qaFinancialProfile), true);
  assert.equal(financialReferenceMonth(qaFinancialProfile), "2026-03");
  for (const month of ["2026-01", "2026-02", "2026-03"]) {
    const snapshot = budgetCategoriesForMonth(qaFinancialProfile, month);
    assert.equal(sum(snapshot.map((category) => category.limit)), 620000);
    assert.equal(snapshot.length, qaCategoryCatalog.length);
  }
});

test("QA monthly totals, savings transfers, payments, and transaction density reconcile", () => {
  const expected = {
    "2026-01": { income: 1600000, expenses: 565000, savings: 1040000, payments: 250000, count: 31 },
    "2026-02": { income: 1600000, expenses: 860000, savings: 740000, payments: 400000, count: 32 },
    "2026-03": { income: 1750000, expenses: 490000, savings: 1260000, payments: 200000, count: 31 },
  } as const;

  for (const [month, values] of Object.entries(expected)) {
    const transactions = inMonth(month);
    const actual = calculateActualSummary(qaFinancialProfile, month);
    const savings = sum(transactions.filter((transaction) => transaction.type === "transfer" && transaction.destinationAccountId === "qa-account-savings").map((transaction) => transaction.amount));
    const payments = sum(transactions.filter((transaction) => transaction.type === "card-payment").map((transaction) => transaction.amount));
    assert.deepEqual({ income: actual.income, expenses: actual.expenses, savings, payments, count: transactions.length }, values);
  }
});

test("QA ledger ends with the intended account balances and card liabilities", () => {
  assert.equal(cardLedgerValid(qaFinancialProfile, qaFinancialProfile.transactions), true);
  const actual = calculateActualSummary(qaFinancialProfile, "2026-03");
  assert.deepEqual(actual.accounts, {
    "qa-account-salary": 1400000,
    "qa-account-everyday": 200000,
    "qa-account-savings": 3140000,
    "qa-account-backup": 35000,
    "qa-account-spare": 0,
  });
  assert.deepEqual(actual.cards, {
    "qa-card-groceries": 130000,
    "qa-card-everyday": 200000,
    "qa-card-backup": 0,
    "qa-card-reserve": 0,
  });
});

test("QA accounts and cards expose the approved purposes without changing balances", () => {
  assert.deepEqual(qaFinancialProfile.accounts.map((item) => item.purpose), ["Salary", "Everyday Expenses", "Main Savings", "Backup", "Spare"]);
  assert.deepEqual(qaFinancialProfile.debitCards?.map((item) => item.purpose), ["Salary", "Everyday", "Savings"]);
  assert.deepEqual(qaFinancialProfile.creditCards.map((item) => item.purpose), ["Groceries", "Basic Purchases", "Backup", "Reserve"]);
  assert.deepEqual(qaFinancialProfile.accounts.map((item) => item.balance), [1160000, 115000, 100000, 35000, 0]);
  assert.deepEqual(qaFinancialProfile.creditCards.map((item) => [item.limit, item.owed]), [[1000000, 0], [1500000, 0], [1200000, 0], [2000000, 0]]);
});

test("QA category outcomes tell the intended three-month story", () => {
  const overBudget = (month: string) => {
    const actual = calculateActualSummary(qaFinancialProfile, month);
    return budgetCategoriesForMonth(qaFinancialProfile, month).filter((category) => category.limit > 0 && (actual.categorySpending[category.name] ?? 0) > category.limit).map((category) => category.name);
  };
  assert.deepEqual(overBudget("2026-01"), ["Groceries", "Dining Out"]);
  assert.deepEqual(overBudget("2026-02"), ["Furniture / Appliances"]);
  assert.deepEqual(overBudget("2026-03"), []);
  assert.equal(inMonth("2026-03").some((transaction) => transaction.type === "income" && transaction.incomeSourceName === "Part Time Wages" && transaction.amount === 150000), true);
});
