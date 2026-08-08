import type { Amount, Currency, FinancialProfile } from "@/lib/financial-types";

export type FinancialSummary = { expectedIncome: Amount; spendingBudget: Amount; plannedSavings: Amount; plannedAvailable: Amount; remainingToAllocate: Amount; accountCash: Amount; availableCredit: { id: string; name: string; amount: Amount }[] };

const sum = (values: Amount[]) => values.reduce((total, value) => total + value, 0);

export function calculateFinancialSummary(profile: FinancialProfile): FinancialSummary {
  const expectedIncome = sum(profile.incomeSources.map((source) => source.amount));
  const spendingBudget = sum(profile.categoryBudgets.map((category) => category.limit));
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
