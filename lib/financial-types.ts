export const FINANCIAL_PROFILE_VERSION = 2 as const;
export const LEGACY_FINANCIAL_PROFILE_VERSION = 1 as const;

export const currencies = ["AED", "USD", "EUR", "GBP", "SAR", "RSD"] as const;
export type Currency = (typeof currencies)[number];
export type Amount = number;

export type IncomeSource = { id: string; name: string; amount: Amount; day: number };
export type Account = { id: string; name: string; type: "current" | "savings" | "cash"; balance: Amount; country?: string; currency?: Currency; lastFour?: string; purpose?: string };
export type DebitCard = { id: string; name: string; country: string; currency: Currency; lastFour?: string; linkedAccountId?: string; purpose?: string };
export type CreditCard = { id: string; name: string; limit: Amount; owed: Amount; dueDay: number; country?: string; currency?: Currency; lastFour?: string; purpose?: string };
export type CategoryBudget = { id: string; name: string; limit: Amount; month?: string };
export type MonthlyBudgetSnapshot = { month: string; limit: Amount };
export type SavingsGoal = { id: string; name: string; target: Amount; saved: Amount; contribution: Amount; startDate?: string; targetDate?: string; priority: number };
export type TransactionImportMetadata = {
  origin: "sms";
  bank: "fab";
  messageType: string;
  fingerprint: string;
  observedBalanceAfter?: Amount;
};
export type TransactionBase = { id: string; amount: Amount; date: string; note?: string; import?: TransactionImportMetadata; createdAt: string; updatedAt: string; createdByUserId?: string; updatedByUserId?: string };
export type AssetSourceKind = "cash" | "account";
export type ExpenseSourceKind = AssetSourceKind | "debit" | "credit";
export type TransferDestinationKind = AssetSourceKind | "credit";
export type IncomeTransaction = TransactionBase & { type: "income"; incomeSourceId?: string; incomeSourceName?: string; destinationKind?: AssetSourceKind; destinationId?: string; /** Legacy v2 field. */ destinationAccountId?: string };
export type HouseholdBudgetOptIn = { included: true; householdId: string; category: string };
export type ExpenseTransaction = TransactionBase & { type: "expense"; category: string; sourceKind?: ExpenseSourceKind; sourceId?: string; householdBudget?: HouseholdBudgetOptIn; /** Legacy v2 fields. */ accountId?: string; cardId?: string };
export type TransferTransaction = TransactionBase & { type: "transfer"; sourceKind?: AssetSourceKind; sourceId?: string; destinationKind?: TransferDestinationKind; destinationId?: string; /** Legacy v2 fields. */ sourceAccountId?: string; destinationAccountId?: string };
export type CardPaymentTransaction = TransactionBase & { type: "card-payment"; payingAccountId: string; receivingCardId: string };
export type Transaction = IncomeTransaction | ExpenseTransaction | TransferTransaction | CardPaymentTransaction;

export type FinancialProfile = {
  version: typeof FINANCIAL_PROFILE_VERSION;
  country?: string;
  currency: Currency;
  /** Day 1-28 on which the user's recurring monthly budget cycle begins. */
  budgetStartDay?: number;
  /** Overall monthly spending ceiling. Category budgets are optional allocations within it. */
  monthlyBudget?: Amount;
  /** Period-specific overall spending ceilings. `monthlyBudget` remains the recurring legacy fallback. */
  monthlyBudgets?: MonthlyBudgetSnapshot[];
  incomeSources: IncomeSource[];
  /** Opening cash position. Current cash is derived by the ledger. */
  cashBalance?: Amount;
  accounts: Account[];
  debitCards?: DebitCard[];
  creditCards: CreditCard[];
  categoryBudgets: CategoryBudget[];
  /** Household-owned custom category suggestions that may exist without a budget allocation. */
  customCategories?: string[];
  savingsGoals: SavingsGoal[];
  onboarding: { currentStep: number; completed: boolean };
  createdAt: string;
  updatedAt: string;
  transactions: Transaction[];
};

export const newLocalId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createFinancialProfile(): FinancialProfile {
  const now = new Date().toISOString();
  return { version: FINANCIAL_PROFILE_VERSION, country: "United Arab Emirates", currency: "AED", budgetStartDay: 1, cashBalance: 0, incomeSources: [], accounts: [], debitCards: [], creditCards: [], categoryBudgets: [], customCategories: [], monthlyBudgets: [], savingsGoals: [], onboarding: { currentStep: 0, completed: false }, createdAt: now, updatedAt: now, transactions: [] };
}
