export const FINANCIAL_PROFILE_VERSION = 1 as const;

export const currencies = ["AED", "USD", "EUR", "GBP", "SAR"] as const;
export type Currency = (typeof currencies)[number];
export type Amount = number;

export type IncomeSource = { id: string; name: string; amount: Amount; day: number };
export type Account = { id: string; name: string; type: "current" | "savings" | "cash"; balance: Amount };
export type CreditCard = { id: string; name: string; limit: Amount; owed: Amount; dueDay: number };
export type CategoryBudget = { id: string; name: string; limit: Amount };
export type SavingsGoal = { id: string; name: string; target: Amount; saved: Amount; contribution: Amount; targetDate?: string; priority: number };

export type FinancialProfile = {
  version: typeof FINANCIAL_PROFILE_VERSION;
  currency: Currency;
  incomeSources: IncomeSource[];
  accounts: Account[];
  creditCards: CreditCard[];
  categoryBudgets: CategoryBudget[];
  savingsGoals: SavingsGoal[];
  onboarding: { currentStep: number; completed: boolean };
  createdAt: string;
  updatedAt: string;
};

export const newLocalId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createFinancialProfile(): FinancialProfile {
  const now = new Date().toISOString();
  return { version: FINANCIAL_PROFILE_VERSION, currency: "AED", incomeSources: [], accounts: [], creditCards: [], categoryBudgets: [], savingsGoals: [], onboarding: { currentStep: 1, completed: false }, createdAt: now, updatedAt: now };
}
