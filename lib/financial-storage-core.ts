export const FINANCIAL_STORAGE_KEY = "awn.financial-profile.v2";
export const LEGACY_FINANCIAL_STORAGE_KEY = "awn.financial-profile.v1";
export const financialStorageKey = (ownerId: string) => `${FINANCIAL_STORAGE_KEY}:${ownerId}`;

export function isFinancialProfile(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  const named = (item: unknown) => !!item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string" && typeof (item as Record<string, unknown>).name === "string";
  const money = (item: unknown) => typeof item === "number" && Number.isSafeInteger(item);
  const optionalDate = (item: unknown) => item === undefined || typeof item === "string" && /^\d{4}-\d{2}-\d{2}/.test(item);
  const optionalPurpose = (item: unknown) => !item || typeof item !== "object" || (item as Record<string, unknown>).purpose === undefined || typeof (item as Record<string, unknown>).purpose === "string";
  const optionalLastFour = (item: unknown) => !item || typeof item !== "object" || (item as Record<string, unknown>).lastFour === undefined || (item as Record<string, unknown>).lastFour === "" || /^\d{4}$/.test(String((item as Record<string, unknown>).lastFour));
  const onboarding = profile.onboarding as Record<string, unknown> | undefined;
  const debitCards = profile.debitCards;
  const settingsValid = (profile.country === undefined || typeof profile.country === "string") && (profile.budgetStartDay === undefined || Number.isInteger(profile.budgetStartDay) && Number(profile.budgetStartDay) >= 1 && Number(profile.budgetStartDay) <= 28) && (profile.monthlyBudget === undefined || money(profile.monthlyBudget) && Number(profile.monthlyBudget) > 0);
  return profile.version === 2 && settingsValid && ["AED", "USD", "EUR", "GBP", "SAR", "RSD"].includes(String(profile.currency)) && Array.isArray(profile.transactions) && Array.isArray(profile.incomeSources) && profile.incomeSources.every(named) && Array.isArray(profile.accounts) && profile.accounts.every((item) => named(item) && optionalPurpose(item) && optionalLastFour(item) && money((item as Record<string, unknown>).balance)) && (debitCards === undefined || Array.isArray(debitCards) && debitCards.every((item) => named(item) && optionalPurpose(item) && optionalLastFour(item) && typeof (item as Record<string, unknown>).country === "string" && ["AED", "USD", "EUR", "GBP", "SAR", "RSD"].includes(String((item as Record<string, unknown>).currency)))) && Array.isArray(profile.creditCards) && profile.creditCards.every((item) => named(item) && optionalPurpose(item) && optionalLastFour(item) && money((item as Record<string, unknown>).limit) && money((item as Record<string, unknown>).owed)) && Array.isArray(profile.categoryBudgets) && profile.categoryBudgets.every((item) => named(item) && money((item as Record<string, unknown>).limit) && ((item as Record<string, unknown>).month === undefined || /^\d{4}-(0[1-9]|1[0-2])$/.test(String((item as Record<string, unknown>).month)))) && Array.isArray(profile.savingsGoals) && profile.savingsGoals.every((item) => named(item) && optionalDate((item as Record<string, unknown>).startDate) && optionalDate((item as Record<string, unknown>).targetDate)) && !!onboarding && Number.isInteger(onboarding.currentStep) && typeof onboarding.completed === "boolean" && typeof profile.createdAt === "string" && typeof profile.updatedAt === "string";
}

export function migrateLegacyProfile(value: unknown): Record<string, unknown> | null { if (!value || typeof value !== "object" || (value as Record<string, unknown>).version !== 1) return null; const migrated = { ...(value as Record<string, unknown>), version: 2, transactions: [] }; return isFinancialProfile(migrated) ? migrated : null; }
export function resetFinancialStorage(storage: { removeItem: (key: string) => void }, ownerId: string) { storage.removeItem(financialStorageKey(ownerId)); }
