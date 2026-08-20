import assert from "node:assert/strict";
import test from "node:test";
import { calculateActualSummary } from "../lib/financial-calculations.ts";
import { budgetPeriodForDate, budgetPeriodForKey } from "../lib/financial-date.ts";
import { mutateLedger, normalizeLedgerProfile, setCurrentCashBalance, UNBUDGETED_CATEGORY, validateLedger } from "../lib/financial-ledger.ts";
import { createFinancialProfile, type FinancialProfile, type Transaction } from "../lib/financial-types.ts";

const stamp = "2026-08-01T08:00:00.000Z";
const tx = (value: Record<string, unknown>): Transaction => ({ ...value, createdAt: stamp, updatedAt: stamp } as Transaction);
function profile(): FinancialProfile {
  return { ...createFinancialProfile(), budgetStartDay: 25, cashBalance: 20000, accounts: [{ id: "a", name: "Main", type: "current", balance: 100000 }, { id: "b", name: "Savings", type: "savings", balance: 50000 }], debitCards: [{ id: "d", name: "Debit", country: "United Arab Emirates", currency: "AED", linkedAccountId: "a" }], creditCards: [{ id: "c", name: "Visa", limit: 100000, owed: 20000, dueDay: 1 }], categoryBudgets: [{ id: "food", name: "Food", limit: 30000, month: "2026-08" }], onboarding: { currentStep: 6, completed: true } };
}

test("budget periods respect a custom start day and retain a stable snapshot key", () => {
  const period = budgetPeriodForDate(25, "2026-08-20"); assert.deepEqual({ key: period.key, start: period.start, end: period.end }, { key: "2026-08", start: "2026-07-25", end: "2026-08-24" });
  assert.deepEqual(budgetPeriodForKey(25, "2026-08").start, "2026-07-25");
  assert.deepEqual(budgetPeriodForDate(25, "2026-08-25").key, "2026-09");
});

test("income can be received into cash", () => {
  const value = profile(); value.transactions = [tx({ id: "i", type: "income", amount: 10000, date: "2026-08-01", destinationKind: "cash" })];
  const ledger = validateLedger(value); assert.equal(ledger.valid && ledger.balances.cash, 30000);
});

test("expenses debit cash, accounts, linked debit accounts, or credit owed", () => {
  const value = profile(); value.transactions = [
    tx({ id: "cash", type: "expense", amount: 1000, date: "2026-08-01", category: "", sourceKind: "cash" }),
    tx({ id: "account", type: "expense", amount: 2000, date: "2026-08-02", category: "Food", sourceKind: "account", sourceId: "a" }),
    tx({ id: "debit", type: "expense", amount: 3000, date: "2026-08-03", category: "Food", sourceKind: "debit", sourceId: "d" }),
    tx({ id: "credit", type: "expense", amount: 4000, date: "2026-08-04", category: "Food", sourceKind: "credit", sourceId: "c" }),
  ];
  const normalized = normalizeLedgerProfile(value); assert.equal((normalized.transactions[0] as { category: string }).category, UNBUDGETED_CATEGORY);
  const ledger = validateLedger(value); assert.equal(ledger.valid, true);
  if (ledger.valid) { assert.equal(ledger.balances.cash, 19000); assert.equal(ledger.balances.accounts.a, 95000); assert.equal(ledger.balances.cards.c, 24000); }
});

test("withdrawals, deposits, account transfers, and credit repayments are neutral transfers", () => {
  const value = profile(); value.transactions = [
    tx({ id: "withdraw", type: "transfer", amount: 10000, date: "2026-07-26", sourceKind: "account", sourceId: "a", destinationKind: "cash" }),
    tx({ id: "deposit", type: "transfer", amount: 5000, date: "2026-07-27", sourceKind: "cash", destinationKind: "account", destinationId: "b" }),
    tx({ id: "move", type: "transfer", amount: 5000, date: "2026-07-28", sourceKind: "account", sourceId: "b", destinationKind: "account", destinationId: "a" }),
    tx({ id: "repay", type: "transfer", amount: 10000, date: "2026-07-29", sourceKind: "account", sourceId: "a", destinationKind: "credit", destinationId: "c" }),
  ];
  const actual = calculateActualSummary(value, "2026-08");
  assert.equal(actual.income, 0); assert.equal(actual.expenses, 0); assert.equal(actual.currentPosition, actual.openingPosition);
  assert.equal(actual.cash, 25000); assert.equal(actual.accounts.a, 85000); assert.equal(actual.accounts.b, 50000); assert.equal(actual.cards.c, 10000);
});

test("rejects negative cash and account balances", () => {
  const cash = profile(); cash.transactions = [tx({ id: "x", type: "expense", amount: 20001, date: "2026-08-01", category: "Food", sourceKind: "cash" })]; assert.equal(validateLedger(cash).valid, false);
  const account = profile(); account.transactions = [tx({ id: "x", type: "expense", amount: 100001, date: "2026-08-01", category: "Food", sourceKind: "account", sourceId: "a" })]; assert.equal(validateLedger(account).valid, false);
});

test("rejects credit purchases above the limit and repayments above owed", () => {
  const purchase = profile(); purchase.transactions = [tx({ id: "x", type: "expense", amount: 80001, date: "2026-08-01", category: "Food", sourceKind: "credit", sourceId: "c" })]; assert.equal(validateLedger(purchase).valid, false);
  const repay = profile(); repay.transactions = [tx({ id: "x", type: "transfer", amount: 20001, date: "2026-08-01", sourceKind: "account", sourceId: "a", destinationKind: "credit", destinationId: "c" })]; assert.equal(validateLedger(repay).valid, false);
});

test("rejects the same transfer endpoint", () => {
  const value = profile(); value.transactions = [tx({ id: "x", type: "transfer", amount: 1000, date: "2026-08-01", sourceKind: "account", sourceId: "a", destinationKind: "account", destinationId: "a" })]; assert.equal(validateLedger(value).valid, false);
});

test("an unlinked debit card cannot fund an expense", () => {
  const value = profile(); value.debitCards = [{ id: "d", name: "Debit", country: "United Arab Emirates", currency: "AED" }]; value.transactions = [tx({ id: "x", type: "expense", amount: 1000, date: "2026-08-01", category: "Food", sourceKind: "debit", sourceId: "d" })]; const result = validateLedger(value); assert.equal(result.valid, false); if (!result.valid) assert.match(result.error, /Link this debit card/);
});

test("historical edits reverse and reapply the complete ledger atomically", () => {
  const value = profile(); value.transactions = [tx({ id: "x", type: "expense", amount: 10000, date: "2026-07-30", category: "Food", sourceKind: "account", sourceId: "a" })];
  const result = mutateLedger(value, { kind: "edit", transaction: tx({ id: "x", type: "expense", amount: 15000, date: "2026-07-30", category: "Food", sourceKind: "cash" }) });
  assert.equal(result.ok, true); if (result.ok) { assert.equal(result.balances.accounts.a, 100000); assert.equal(result.balances.cash, 5000); }
});

test("deletion reverses the financial effect", () => {
  const value = profile(); value.transactions = [tx({ id: "x", type: "expense", amount: 10000, date: "2026-08-01", category: "Food", sourceKind: "account", sourceId: "a" })];
  const result = mutateLedger(value, { kind: "delete", id: "x" }); assert.equal(result.ok, true); if (result.ok) assert.equal(result.balances.accounts.a, 100000);
});

test("invalid edits are rejected without producing a candidate profile", () => {
  const value = profile(); value.transactions = [tx({ id: "x", type: "expense", amount: 10000, date: "2026-08-01", category: "Food", sourceKind: "account", sourceId: "a" })];
  const result = mutateLedger(value, { kind: "edit", transaction: tx({ id: "x", type: "expense", amount: 200000, date: "2026-08-01", category: "Food", sourceKind: "account", sourceId: "a" }) }); assert.equal(result.ok, false);
});

test("legacy account, credit expense, and card-payment records normalize safely", () => {
  const value = profile(); value.transactions = [
    tx({ id: "i", type: "income", amount: 1000, date: "2026-07-26", destinationAccountId: "a" }),
    tx({ id: "e", type: "expense", amount: 2000, date: "2026-07-27", category: "Food", cardId: "c" }),
    tx({ id: "p", type: "card-payment", amount: 5000, date: "2026-07-28", payingAccountId: "a", receivingCardId: "c" }),
  ];
  const normalized = normalizeLedgerProfile(value); assert.deepEqual(normalized.transactions.map((item) => item.type), ["income", "expense", "transfer"]); assert.equal(validateLedger(normalized).valid, true);
});

test("opening position plus income minus expenses equals current position", () => {
  const value = profile(); value.transactions = [tx({ id: "i", type: "income", amount: 10000, date: "2026-08-01", destinationKind: "account", destinationId: "a" }), tx({ id: "e", type: "expense", amount: 4000, date: "2026-08-02", category: "Food", sourceKind: "credit", sourceId: "c" })];
  const actual = calculateActualSummary(value, "2026-08"); assert.equal(actual.openingPosition + actual.income - actual.expenses, actual.currentPosition);
});

test("manual cash correction changes current cash without a fake transaction", () => {
  const value = profile(); value.transactions = [tx({ id: "i", type: "income", amount: 10000, date: "2026-08-01", destinationKind: "cash" })];
  const result = setCurrentCashBalance(value, 25000); assert.equal(result.ok, true); if (result.ok) { assert.equal(result.balances.cash, 25000); assert.equal(result.profile.transactions.length, 1); }
});

test("reporting includes an unbudgeted-only category and uses spending, not net income", () => {
  const value = profile(); value.transactions = [tx({ id: "i", type: "income", amount: 100000, date: "2026-08-01", destinationKind: "account", destinationId: "a" }), tx({ id: "e", type: "expense", amount: 35000, date: "2026-08-02", category: "", sourceKind: "account", sourceId: "a" })];
  const actual = calculateActualSummary(value, "2026-08"); assert.equal(actual.categorySpending[UNBUDGETED_CATEGORY], 35000); assert.equal(actual.unbudgetedExpenses, 35000); assert.equal(actual.moneyLeft, 65000);
});
