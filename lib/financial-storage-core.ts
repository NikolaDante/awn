export const FINANCIAL_STORAGE_KEY = "awn.financial-profile.v2";
export const LEGACY_FINANCIAL_STORAGE_KEY = "awn.financial-profile.v1";
export const financialStorageKey = (ownerId: string) => `${FINANCIAL_STORAGE_KEY}:${ownerId}`;
export const CLOUD_MIGRATION_BACKUP_KEY = "awn.financial.profile.cloud-migration-backup.v2";
export const cloudMigrationBackupKey = (ownerId: string) => `${CLOUD_MIGRATION_BACKUP_KEY}:${ownerId}`;

export function isFinancialProfile(value: unknown): value is FinancialProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  const named = (item: unknown) => !!item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string" && typeof (item as Record<string, unknown>).name === "string";
  const money = (item: unknown) => typeof item === "number" && Number.isSafeInteger(item);
  const optionalDate = (item: unknown) => item === undefined || typeof item === "string" && /^\d{4}-\d{2}-\d{2}/.test(item);
  const optionalPurpose = (item: unknown) => !item || typeof item !== "object" || (item as Record<string, unknown>).purpose === undefined || typeof (item as Record<string, unknown>).purpose === "string";
  const optionalLastFour = (item: unknown) => !item || typeof item !== "object" || (item as Record<string, unknown>).lastFour === undefined || (item as Record<string, unknown>).lastFour === "" || /^\d{4}$/.test(String((item as Record<string, unknown>).lastFour));
  const transactionValid = (item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const value = item as Record<string, unknown>;
    if (typeof value.id !== "string" || !money(value.amount) || Number(value.amount) <= 0 || typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return false;
    if (value.type === "income") return value.destinationKind === undefined || value.destinationKind === "cash" || value.destinationKind === "account";
    if (value.type === "expense") {
      const household = value.householdBudget;
      const householdValid = household === undefined || !!household && typeof household === "object"
        && (household as Record<string, unknown>).included === true
        && typeof (household as Record<string, unknown>).householdId === "string"
        && typeof (household as Record<string, unknown>).category === "string";
      return householdValid && typeof value.category === "string" && (value.sourceKind === undefined || ["cash", "account", "debit", "credit"].includes(String(value.sourceKind)));
    }
    if (value.type === "transfer") return value.sourceKind === undefined && typeof value.sourceAccountId === "string" && typeof value.destinationAccountId === "string" || ["cash", "account"].includes(String(value.sourceKind)) && ["cash", "account", "credit"].includes(String(value.destinationKind));
    return value.type === "card-payment" && typeof value.payingAccountId === "string" && typeof value.receivingCardId === "string";
  };
  const onboarding = profile.onboarding as Record<string, unknown> | undefined;
  const debitCards = profile.debitCards;
  const monthlyBudgets = profile.monthlyBudgets;
  const settingsValid = (profile.country === undefined || typeof profile.country === "string") && (profile.budgetStartDay === undefined || Number.isInteger(profile.budgetStartDay) && Number(profile.budgetStartDay) >= 1 && Number(profile.budgetStartDay) <= 28) && (profile.usualMonthlyIncome === undefined || money(profile.usualMonthlyIncome) && Number(profile.usualMonthlyIncome) >= 0) && (profile.monthlySavingsGuidance === undefined || money(profile.monthlySavingsGuidance) && Number(profile.monthlySavingsGuidance) >= 0) && (profile.monthlyBudget === undefined || money(profile.monthlyBudget) && Number(profile.monthlyBudget) > 0) && (monthlyBudgets === undefined || Array.isArray(monthlyBudgets) && monthlyBudgets.every((item) => !!item && typeof item === "object" && /^\d{4}-(0[1-9]|1[0-2])$/.test(String((item as Record<string, unknown>).month)) && money((item as Record<string, unknown>).limit) && Number((item as Record<string, unknown>).limit) > 0)) && (profile.cashBalance === undefined || money(profile.cashBalance) && Number(profile.cashBalance) >= 0) && (profile.customCategories === undefined || Array.isArray(profile.customCategories) && profile.customCategories.every((item) => typeof item === "string" && item.trim() === item && item.length > 0 && item.length <= 60));
  return profile.version === 2 && settingsValid && ["AED", "USD", "EUR", "GBP", "SAR", "RSD"].includes(String(profile.currency)) && Array.isArray(profile.transactions) && profile.transactions.every(transactionValid) && Array.isArray(profile.incomeSources) && profile.incomeSources.every(named) && Array.isArray(profile.accounts) && profile.accounts.every((item) => named(item) && optionalPurpose(item) && optionalLastFour(item) && money((item as Record<string, unknown>).balance) && Number((item as Record<string, unknown>).balance) >= 0) && (debitCards === undefined || Array.isArray(debitCards) && debitCards.every((item) => named(item) && optionalPurpose(item) && optionalLastFour(item) && typeof (item as Record<string, unknown>).country === "string" && ["AED", "USD", "EUR", "GBP", "SAR", "RSD"].includes(String((item as Record<string, unknown>).currency)))) && Array.isArray(profile.creditCards) && profile.creditCards.every((item) => named(item) && optionalPurpose(item) && optionalLastFour(item) && money((item as Record<string, unknown>).limit) && Number((item as Record<string, unknown>).limit) > 0 && money((item as Record<string, unknown>).owed) && Number((item as Record<string, unknown>).owed) >= 0 && Number((item as Record<string, unknown>).owed) <= Number((item as Record<string, unknown>).limit)) && Array.isArray(profile.categoryBudgets) && profile.categoryBudgets.every((item) => named(item) && money((item as Record<string, unknown>).limit) && ((item as Record<string, unknown>).month === undefined || /^\d{4}-(0[1-9]|1[0-2])$/.test(String((item as Record<string, unknown>).month)))) && Array.isArray(profile.savingsGoals) && profile.savingsGoals.every((item) => named(item) && optionalDate((item as Record<string, unknown>).startDate) && optionalDate((item as Record<string, unknown>).targetDate)) && !!onboarding && Number.isInteger(onboarding.currentStep) && typeof onboarding.completed === "boolean" && typeof profile.createdAt === "string" && typeof profile.updatedAt === "string";
}

export function migrateLegacyProfile(value: unknown): Record<string, unknown> | null { if (!value || typeof value !== "object" || (value as Record<string, unknown>).version !== 1) return null; const migrated = { ...(value as Record<string, unknown>), version: 2, transactions: [] }; return isFinancialProfile(migrated) ? migrated : null; }
export function resetFinancialStorage(storage: { removeItem: (key: string) => void }, ownerId: string) { storage.removeItem(financialStorageKey(ownerId)); }
import type { FinancialProfile } from "@/lib/financial-types";
