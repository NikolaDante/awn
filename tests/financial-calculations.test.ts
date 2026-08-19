import test from "node:test";
import assert from "node:assert/strict";
import { calculateActualSummary, cardLedgerValid } from "../lib/financial-calculations.ts";
import { createFinancialProfile } from "../lib/financial-types.ts";
import { financialStorageKey, isFinancialProfile, migrateLegacyProfile, resetFinancialStorage } from "../lib/financial-storage-core.ts";
import { hasLinkedAccountActivity, hasLinkedCardActivity, removedFinancialReference, transactionHistoryDetail, transactionHistoryLabel } from "../lib/financial-reference-guards.ts";

const profile = () => {
  const value = createFinancialProfile();
  value.currency = "AED";
  value.accounts = [{ id: "account", name: "Current", type: "current", balance: 500000 }];
  value.creditCards = [{ id: "card", name: "Everyday card", limit: 1000000, owed: 50000, dueDay: 10 }];
  value.categoryBudgets = [{ id: "groceries", name: "Groceries", limit: 150000 }];
  value.transactions = [
    { id: "income", type: "income", amount: 1200000, date: "2026-08-05", destinationAccountId: "account", createdAt: "2026-08-05T08:00:00Z", updatedAt: "2026-08-05T08:00:00Z" },
    { id: "food", type: "expense", amount: 60000, date: "2026-08-06", category: "Groceries", accountId: "account", createdAt: "2026-08-06T08:00:00Z", updatedAt: "2026-08-06T08:00:00Z" },
    { id: "card-food", type: "expense", amount: 30000, date: "2026-08-07", category: "Groceries", cardId: "card", createdAt: "2026-08-07T08:00:00Z", updatedAt: "2026-08-07T08:00:00Z" },
    { id: "unlinked", type: "expense", amount: 20000, date: "2026-08-08", category: "Other", createdAt: "2026-08-08T08:00:00Z", updatedAt: "2026-08-08T08:00:00Z" },
    { id: "transfer", type: "transfer", amount: 100000, date: "2026-08-09", sourceAccountId: "account", destinationAccountId: "account-2", createdAt: "2026-08-09T08:00:00Z", updatedAt: "2026-08-09T08:00:00Z" },
    { id: "payment", type: "card-payment", amount: 40000, date: "2026-08-10", payingAccountId: "account", receivingCardId: "card", createdAt: "2026-08-10T08:00:00Z", updatedAt: "2026-08-10T08:00:00Z" },
  ];
  return value;
};

test("calculates actual monthly activity and excludes transfers/payments", () => {
  const summary = calculateActualSummary(profile(), "2026-08");
  assert.equal(summary.income, 1200000); assert.equal(summary.expenses, 110000); assert.equal(summary.moneyLeft, 1090000); assert.equal(summary.categorySpending.Groceries, 90000); assert.equal(summary.budgetRemaining.Groceries, 60000); assert.equal(summary.unbudgetedExpenses, 20000);
});

test("rejects a card payment that would overpay chronologically", () => {
  const value = profile();
  const invalid = [...value.transactions, { id: "bad", type: "card-payment" as const, amount: 100000, date: "2026-08-11", payingAccountId: "account", receivingCardId: "card", createdAt: "2026-08-11T08:00:00Z", updatedAt: "2026-08-11T08:00:00Z" }];
  assert.equal(cardLedgerValid(value, invalid), false);
});

test("derives linked and unlinked balance effects", () => {
  const value = profile(); value.accounts.push({ id: "account-2", name: "Secondary", type: "current", balance: 0 });
  const summary = calculateActualSummary(value, "2026-08");
  assert.equal(summary.accounts.account, 1500000); assert.equal(summary.accounts["account-2"], 100000); assert.equal(summary.cards.card, 40000); assert.equal(summary.availableCredit.card, 960000);
});

test("linked and unlinked income both count while only linked income changes cash", () => {
  const value = profile(); const balanceBefore = calculateActualSummary(value, "2026-08").accounts.account; value.transactions.push({ id: "unlinked-income", type: "income", amount: 10000, date: "2026-08-12", createdAt: "2026-08-12T08:00:00Z", updatedAt: "2026-08-12T08:00:00Z" });
  const summary = calculateActualSummary(value, "2026-08"); assert.equal(summary.income, 1210000); assert.equal(summary.accounts.account, balanceBefore);
});

test("month boundaries exclude activity outside the selected month", () => {
  const value = profile(); value.transactions.push({ id: "older", type: "expense", amount: 99900, date: "2026-07-31", category: "Groceries", createdAt: "2026-07-31T23:00:00Z", updatedAt: "2026-07-31T23:00:00Z" });
  assert.equal(calculateActualSummary(value, "2026-08").expenses, 110000); assert.equal(calculateActualSummary(value, "2026-07").expenses, 99900);
});

test("over-budget and unbudgeted spending stay distinct", () => {
  const value = profile(); value.transactions.push({ id: "more-food", type: "expense", amount: 70000, date: "2026-08-13", category: "Groceries", createdAt: "2026-08-13T08:00:00Z", updatedAt: "2026-08-13T08:00:00Z" });
  const summary = calculateActualSummary(value, "2026-08"); assert.equal(summary.budgetRemaining.Groceries, -10000); assert.equal(summary.unbudgetedExpenses, 20000);
});

test("editing and deleting ordinary transactions recalculate from the full ledger", () => {
  const value = profile(); const edited = value.transactions.map((item) => item.id === "food" ? { ...item, amount: 50000 } : item); value.transactions = edited; assert.equal(calculateActualSummary(value, "2026-08").expenses, 100000); value.transactions = edited.filter((item) => item.id !== "unlinked"); assert.equal(calculateActualSummary(value, "2026-08").expenses, 80000);
});

test("editing or deleting a purchase can invalidate a later card payment", () => {
  const value = profile(); value.creditCards[0].owed = 0; const payment = value.transactions.find((item) => item.id === "payment")!; const purchase = value.transactions.find((item) => item.id === "card-food")!; assert.equal(cardLedgerValid(value, [purchase, payment]), false); const largerPurchase = { ...purchase, amount: 50000 }; assert.equal(cardLedgerValid(value, [largerPurchase, payment]), true); assert.equal(cardLedgerValid(value, [payment]), false);
});

test("same-day ordering uses creation time and stable id", () => {
  const value = profile(); value.creditCards[0].owed = 0; const purchase = { id: "a", type: "expense" as const, amount: 50000, date: "2026-08-01", category: "Other", cardId: "card", createdAt: "2026-08-01T08:00:00Z", updatedAt: "2026-08-01T08:00:00Z" }; const payment = { id: "b", type: "card-payment" as const, amount: 50000, date: "2026-08-01", payingAccountId: "account", receivingCardId: "card", createdAt: "2026-08-01T09:00:00Z", updatedAt: "2026-08-01T09:00:00Z" }; assert.equal(cardLedgerValid(value, [payment, purchase]), true);
});

test("migrates a valid version 1 profile without losing planning data", () => {
  const current = profile(); const { transactions: _transactions, ...rest } = current; const legacy = { ...rest, version: 1 }; const migrated = migrateLegacyProfile(legacy); assert.ok(migrated); assert.equal(migrated.version, 2); assert.deepEqual(migrated.transactions, []); assert.deepEqual(migrated.accounts, legacy.accounts); assert.deepEqual(migrated.creditCards, legacy.creditCards); assert.deepEqual(migrated.categoryBudgets, legacy.categoryBudgets); assert.deepEqual(migrated.savingsGoals, legacy.savingsGoals); assert.deepEqual(migrated.onboarding, legacy.onboarding); assert.equal(migrated.createdAt, legacy.createdAt); assert.equal(migrated.updatedAt, legacy.updatedAt); void _transactions;
});

test("rejects corrupted and unsupported profiles", () => { assert.equal(isFinancialProfile({ version: 2 }), false); assert.equal(isFinancialProfile({ ...profile(), version: 99 }), false); assert.equal(migrateLegacyProfile({ version: 99 }), null); });

test("financial storage is scoped to the authenticated user", () => { assert.notEqual(financialStorageKey("user-a"), financialStorageKey("user-b")); });

test("reset removes only the authenticated user's financial profile", () => { const removed: string[] = []; resetFinancialStorage({ removeItem: (key) => removed.push(key) }, "user-a"); assert.deepEqual(removed, [financialStorageKey("user-a")]); assert.ok(!removed.includes(financialStorageKey("user-b"))); assert.ok(!removed.includes("unrelated.preference")); });

test("manual savings progress changes only the selected goal", () => { const value = profile(); value.savingsGoals = [{ id: "goal", name: "Trip", target: 100000, saved: 10000, contribution: 5000, priority: 1 }]; const before = calculateActualSummary(value, "2026-08"); value.savingsGoals = value.savingsGoals.map((goal) => ({ ...goal, saved: 40000 })); assert.equal(value.savingsGoals[0].saved, 40000); assert.deepEqual(calculateActualSummary(value, "2026-08"), before); });

test("allows removing an unreferenced account", () => { const value = profile(); value.accounts.push({ id: "unused", name: "Unused", type: "savings", balance: 0 }); const candidate = { ...value, accounts: value.accounts.filter((account) => account.id !== "unused") }; assert.equal(removedFinancialReference(value, candidate), null); });
test("rejects removing an account linked to income", () => { const value = profile(); const candidate = { ...value, accounts: [] }; assert.equal(removedFinancialReference(value, candidate), "account"); });
test("rejects removing an account linked to an expense", () => { const value = profile(); value.transactions = value.transactions.filter((transaction) => transaction.type === "expense" && transaction.accountId ? true : false); const candidate = { ...value, accounts: [] }; assert.equal(removedFinancialReference(value, candidate), "account"); });
test("rejects removing either transfer endpoint", () => { const value = profile(); value.accounts.push({ id: "account-2", name: "Secondary", type: "current", balance: 0 }); assert.equal(hasLinkedAccountActivity(value, "account"), true); assert.equal(hasLinkedAccountActivity(value, "account-2"), true); assert.equal(removedFinancialReference(value, { ...value, accounts: value.accounts.filter((account) => account.id !== "account") }), "account"); assert.equal(removedFinancialReference(value, { ...value, accounts: value.accounts.filter((account) => account.id !== "account-2") }), "account"); });
test("rejects removing the paying account of a card payment", () => { const value = profile(); value.transactions = value.transactions.filter((transaction) => transaction.type === "card-payment"); assert.equal(removedFinancialReference(value, { ...value, accounts: [] }), "account"); });
test("rejects removing a card used for a purchase", () => { const value = profile(); value.transactions = value.transactions.filter((transaction) => transaction.type === "expense" && transaction.cardId); assert.equal(removedFinancialReference(value, { ...value, creditCards: [] }), "credit-card"); });
test("rejects removing a card used for a card payment", () => { const value = profile(); value.transactions = value.transactions.filter((transaction) => transaction.type === "card-payment"); assert.equal(removedFinancialReference(value, { ...value, creditCards: [] }), "credit-card"); });
test("renaming linked accounts and cards preserves stable transaction references", () => { const value = profile(); const candidate = { ...value, accounts: value.accounts.map((account) => ({ ...account, name: "Renamed main" })), creditCards: value.creditCards.map((card) => ({ ...card, name: "Renamed card" })) }; assert.equal(removedFinancialReference(value, candidate), null); assert.equal(candidate.transactions.find((transaction) => transaction.type === "income")?.destinationAccountId, "account"); assert.equal(candidate.transactions.find((transaction) => transaction.type === "card-payment")?.receivingCardId, "card"); });
test("a rejected removal leaves the profile and ledger unchanged", () => { const value = profile(); const before = structuredClone(value); const candidate = { ...value, accounts: [] }; assert.equal(removedFinancialReference(value, candidate), "account"); assert.deepEqual(value, before); assert.deepEqual(value.transactions, before.transactions); });
test("historical transaction labels remain understandable", () => { const value = profile(); const income = value.transactions.find((transaction) => transaction.type === "income")!; assert.equal(transactionHistoryLabel({ ...income, incomeSourceName: "Former employer" }), "Former employer"); assert.equal(transactionHistoryLabel(value.transactions.find((transaction) => transaction.type === "expense")!), "Groceries"); assert.equal(transactionHistoryLabel(value.transactions.find((transaction) => transaction.type === "transfer")!), "Account transfer"); assert.equal(hasLinkedCardActivity(value, "card"), true); });
test("income display uses source snapshot and destination account", () => { const value = profile(); const income = value.transactions.find((transaction) => transaction.type === "income")!; assert.equal(transactionHistoryLabel({ ...income, incomeSourceName: "Former employer" }), "Former employer"); assert.equal(transactionHistoryDetail(value, income), "2026-08-05 · To Current"); });
test("income without a source still names its destination account", () => { const value = profile(); const income = value.transactions.find((transaction) => transaction.type === "income")!; const unlinkedSource = { ...income, incomeSourceId: undefined, incomeSourceName: undefined }; assert.equal(transactionHistoryLabel(unlinkedSource), "Income"); assert.equal(transactionHistoryDetail(value, unlinkedSource), "2026-08-05 · To Current"); });
test("income with a source and no destination explains the missing account", () => { const value = profile(); const income = value.transactions.find((transaction) => transaction.type === "income")!; const unlinkedDestination = { ...income, incomeSourceName: "Former employer", destinationAccountId: undefined }; assert.equal(transactionHistoryLabel(unlinkedDestination), "Former employer"); assert.equal(transactionHistoryDetail(value, unlinkedDestination), "2026-08-05 · No account linked"); });
test("income with neither source nor destination uses neutral wording", () => { const value = profile(); const income = value.transactions.find((transaction) => transaction.type === "income")!; const unlinked = { ...income, incomeSourceId: undefined, incomeSourceName: undefined, destinationAccountId: undefined }; assert.equal(transactionHistoryLabel(unlinked), "Income"); assert.equal(transactionHistoryDetail(value, unlinked), "2026-08-05 · No account linked"); });
