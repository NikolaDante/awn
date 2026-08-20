import { budgetCategoriesForMonth } from "./financial-budget.ts";
import { budgetPeriodForKey, dateInBudgetPeriod, financialReferenceMonth } from "./financial-date.ts";
import { ledgerBalancesAt, normalizeLedgerProfile, orderTransactions, periodCategories, validateLedger } from "./financial-ledger.ts";
import { effectiveMonthlyBudget } from "./onboarding.ts";
import type { Amount, Currency, FinancialProfile, Transaction } from "@/lib/financial-types";

export type FinancialSummary = { expectedIncome: Amount; spendingBudget: Amount; plannedSavings: Amount; plannedAvailable: Amount; remainingToAllocate: Amount; accountCash: Amount; availableCredit: { id: string; name: string; amount: Amount }[] };

const sum = (values: Amount[]) => values.reduce((total, value) => total + value, 0);

export function calculateFinancialSummary(profile: FinancialProfile, month = financialReferenceMonth(profile)): FinancialSummary {
  const expectedIncome = sum(profile.incomeSources.map((source) => source.amount));
  const spendingBudget = effectiveMonthlyBudget(profile, month) ?? 0;
  const plannedSavings = sum(profile.savingsGoals.map((goal) => goal.contribution));
  return { expectedIncome, spendingBudget, plannedSavings, plannedAvailable: expectedIncome - plannedSavings, remainingToAllocate: expectedIncome - spendingBudget - plannedSavings, accountCash: sum(profile.accounts.map((account) => account.balance)), availableCredit: profile.creditCards.map((card) => ({ id: card.id, name: card.name, amount: card.limit - card.owed })) };
}

export function formatMoney(amount: Amount, currency: Currency) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 100);
}

export function parseMoney(value: string): Amount {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d*(\.\d{0,2})?$/.test(normalized) || normalized === "") return 0;
  const [whole = "0", decimal = ""] = normalized.split(".");
  return Number(whole) * 100 + Number((decimal + "00").slice(0, 2));
}

export const moneyInput = (amount: Amount) => amount ? (amount / 100).toFixed(2) : "";

export function normalizeMoneyDraft(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  if (normalized === "") return "";
  if (normalized === ".") return "0.";
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  return normalized;
}

export type ActualSummary = { income: Amount; expenses: Amount; expenseCount: number; averageExpense: Amount; moneyLeft: Amount; openingPosition: Amount; currentPosition: Amount; cash: Amount; spendableAssets: Amount; categorySpending: Record<string, Amount>; budgetRemaining: Record<string, Amount>; budgetedExpenses: Amount; unbudgetedExpenses: Amount; accounts: Record<string, Amount>; cards: Record<string, Amount>; availableCredit: Record<string, Amount> };
export const isExpenseTransaction = (transaction: Transaction): transaction is Extract<Transaction, { type: "expense" }> => transaction.type === "expense";
export function isValidDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00`)) && date <= new Date().toLocaleDateString("en-CA"); }
export function calculateActualSummary(profile: FinancialProfile, month: string) {
  const normalized = normalizeLedgerProfile(profile);
  const period = budgetPeriodForKey(normalized.budgetStartDay, month);
  const inMonth = orderTransactions(normalized.transactions).filter((transaction) => dateInBudgetPeriod(transaction.date, period));
  const expenseTransactions = inMonth.filter(isExpenseTransaction);
  const categories = budgetCategoriesForMonth(profile, month);
  const income = inMonth.filter((transaction) => transaction.type === "income").reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenses = expenseTransactions.reduce((total, transaction) => total + transaction.amount, 0);
  const expenseCount = expenseTransactions.length;
  const categorySpending = periodCategories(normalized, expenseTransactions);
  const budgetRemaining: Record<string, Amount> = {}; categories.forEach((category) => { budgetRemaining[category.name] = category.limit - (categorySpending[category.name] ?? 0); });
  const allocatedCategories = new Set(categories.filter((category) => category.limit > 0).map((category) => category.name));
  const budgetedExpenses = expenseTransactions.filter((transaction) => allocatedCategories.has(transaction.category)).reduce((total, transaction) => total + transaction.amount, 0);
  const current = ledgerBalancesAt(normalized);
  const opening = ledgerBalancesAt(normalized, period.start);
  const openingPosition = sum(Object.values(opening.accounts)) + opening.cash - sum(Object.values(opening.cards));
  const currentPosition = openingPosition + income - expenses;
  const spendableAssets = sum(Object.values(current.accounts)) + current.cash;
  return { income, expenses, expenseCount, averageExpense: expenseCount ? Math.round(expenses / expenseCount) : 0, moneyLeft: income - expenses, openingPosition, currentPosition, cash: current.cash, spendableAssets, categorySpending, budgetRemaining, budgetedExpenses, unbudgetedExpenses: expenses - budgetedExpenses, accounts: current.accounts, cards: current.cards, availableCredit: current.availableCredit } satisfies ActualSummary;
}
export function cardLedgerValid(profile: FinancialProfile, candidate: Transaction[]) { return validateLedger(profile, candidate).valid; }
