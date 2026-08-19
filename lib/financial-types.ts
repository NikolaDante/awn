export const FINANCIAL_PROFILE_VERSION = 2 as const;
export const LEGACY_FINANCIAL_PROFILE_VERSION = 1 as const;

export const currencies = ["AED", "USD", "EUR", "GBP", "SAR", "RSD"] as const;
export type Currency = (typeof currencies)[number];
export type Amount = number;

export type IncomeSource = { id: string; name: string; amount: Amount; day: number };
export type Account = { id: string; name: string; type: "current" | "savings" | "cash"; balance: Amount; country?: string; currency?: Currency; lastFour?: string; purpose?: string };
export type DebitCard = { id: string; name: string; country: string; currency: Currency; lastFour: string; linkedAccountId?: string; purpose?: string };
export type CreditCard = { id: string; name: string; limit: Amount; owed: Amount; dueDay: number; country?: string; currency?: Currency; lastFour?: string; purpose?: string };
export type CategoryBudget = { id: string; name: string; limit: Amount; month?: string };
export type SavingsGoal = { id: string; name: string; target: Amount; saved: Amount; contribution: Amount; startDate?: string; targetDate?: string; priority: number };
export type TransactionBase = { id: string; amount: Amount; date: string; note?: string; createdAt: string; updatedAt: string };
export type IncomeTransaction = TransactionBase & { type: "income"; incomeSourceId?: string; incomeSourceName?: string; destinationAccountId?: string };
export type ExpenseTransaction = TransactionBase & { type: "expense"; category: string; accountId?: string; cardId?: string };
export type TransferTransaction = TransactionBase & { type: "transfer"; sourceAccountId: string; destinationAccountId: string };
export type CardPaymentTransaction = TransactionBase & { type: "card-payment"; payingAccountId: string; receivingCardId: string };
export type Transaction = IncomeTransaction | ExpenseTransaction | TransferTransaction | CardPaymentTransaction;

export type FinancialProfile = {
  version: typeof FINANCIAL_PROFILE_VERSION;
  currency: Currency;
  incomeSources: IncomeSource[];
  accounts: Account[];
  debitCards?: DebitCard[];
  creditCards: CreditCard[];
  categoryBudgets: CategoryBudget[];
  savingsGoals: SavingsGoal[];
  onboarding: { currentStep: number; completed: boolean };
  createdAt: string;
  updatedAt: string;
  transactions: Transaction[];
};

export const newLocalId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createFinancialProfile(): FinancialProfile {
  const now = new Date().toISOString();
  return { version: FINANCIAL_PROFILE_VERSION, currency: "AED", incomeSources: [], accounts: [], debitCards: [], creditCards: [], categoryBudgets: [], savingsGoals: [], onboarding: { currentStep: 1, completed: false }, createdAt: now, updatedAt: now, transactions: [] };
}
