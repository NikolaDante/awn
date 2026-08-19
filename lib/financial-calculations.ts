import { budgetCategoriesForMonth } from "./financial-budget.ts";
import { financialReferenceMonth } from "./financial-date.ts";
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

export type ActualSummary = { income: Amount; expenses: Amount; expenseCount: number; averageExpense: Amount; moneyLeft: Amount; categorySpending: Record<string, Amount>; budgetRemaining: Record<string, Amount>; budgetedExpenses: Amount; unbudgetedExpenses: Amount; accounts: Record<string, Amount>; cards: Record<string, Amount>; availableCredit: Record<string, Amount> };
const orderTransactions = (transactions: Transaction[]) => [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
export const isExpenseTransaction = (transaction: Transaction): transaction is Extract<Transaction, { type: "expense" }> => transaction.type === "expense";
export function isValidDate(date: string) { return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00`)) && date <= new Date().toLocaleDateString("en-CA"); }
export function calculateActualSummary(profile: FinancialProfile, month: string) {
  const inMonth = orderTransactions(profile.transactions).filter((transaction) => transaction.date.startsWith(month));
  const expenseTransactions = inMonth.filter(isExpenseTransaction);
  const categories = budgetCategoriesForMonth(profile, month);
  const income = inMonth.filter((transaction) => transaction.type === "income").reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenses = expenseTransactions.reduce((total, transaction) => total + transaction.amount, 0);
  const expenseCount = expenseTransactions.length;
  const categorySpending: Record<string, Amount> = {}; expenseTransactions.forEach((transaction) => { categorySpending[transaction.category] = (categorySpending[transaction.category] ?? 0) + transaction.amount; });
  const budgetRemaining: Record<string, Amount> = {}; categories.forEach((category) => { budgetRemaining[category.name] = category.limit - (categorySpending[category.name] ?? 0); });
  const allocatedCategories = new Set(categories.filter((category) => category.limit > 0).map((category) => category.name));
  const budgetedExpenses = expenseTransactions.filter((transaction) => allocatedCategories.has(transaction.category)).reduce((total, transaction) => total + transaction.amount, 0);
  const accounts: Record<string, Amount> = {}; profile.accounts.forEach((account) => { accounts[account.id] = account.balance; }); const cards: Record<string, Amount> = {}; profile.creditCards.forEach((card) => { cards[card.id] = card.owed; });
  for (const transaction of orderTransactions(profile.transactions)) { if (transaction.type === "income" && transaction.destinationAccountId && accounts[transaction.destinationAccountId] !== undefined) accounts[transaction.destinationAccountId] += transaction.amount; if (transaction.type === "expense" && transaction.accountId && accounts[transaction.accountId] !== undefined) accounts[transaction.accountId] -= transaction.amount; if (transaction.type === "expense" && transaction.cardId && cards[transaction.cardId] !== undefined) cards[transaction.cardId] += transaction.amount; if (transaction.type === "transfer" && accounts[transaction.sourceAccountId] !== undefined && accounts[transaction.destinationAccountId] !== undefined) { accounts[transaction.sourceAccountId] -= transaction.amount; accounts[transaction.destinationAccountId] += transaction.amount; } if (transaction.type === "card-payment" && accounts[transaction.payingAccountId] !== undefined && cards[transaction.receivingCardId] !== undefined) { accounts[transaction.payingAccountId] -= transaction.amount; cards[transaction.receivingCardId] -= transaction.amount; } }
  const availableCredit: Record<string, Amount> = {}; profile.creditCards.forEach((card) => { availableCredit[card.id] = card.limit - cards[card.id]; });
  return { income, expenses, expenseCount, averageExpense: expenseCount ? Math.round(expenses / expenseCount) : 0, moneyLeft: income - expenses, categorySpending, budgetRemaining, budgetedExpenses, unbudgetedExpenses: expenses - budgetedExpenses, accounts, cards, availableCredit } satisfies ActualSummary;
}
export function cardLedgerValid(profile: FinancialProfile, candidate: Transaction[]) { const cards: Record<string, Amount> = {}; profile.creditCards.forEach((card) => { cards[card.id] = card.owed; }); for (const transaction of orderTransactions(candidate)) { if (transaction.type === "expense" && transaction.cardId) cards[transaction.cardId] += transaction.amount; if (transaction.type === "card-payment") { cards[transaction.receivingCardId] -= transaction.amount; if (cards[transaction.receivingCardId] < 0) return false; } } return true; }
