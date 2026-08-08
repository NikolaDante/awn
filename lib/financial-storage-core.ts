export const FINANCIAL_STORAGE_KEY = "awn.financial-profile.v2";
export const LEGACY_FINANCIAL_STORAGE_KEY = "awn.financial-profile.v1";

export function isFinancialProfile(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>; const named = (item: unknown) => !!item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string" && typeof (item as Record<string, unknown>).name === "string"; const money = (item: unknown) => typeof item === "number" && Number.isSafeInteger(item);
  return profile.version === 2 && ["AED", "USD", "EUR", "GBP", "SAR"].includes(String(profile.currency)) && Array.isArray(profile.transactions) && Array.isArray(profile.incomeSources) && profile.incomeSources.every(named) && Array.isArray(profile.accounts) && profile.accounts.every((item) => named(item) && money((item as Record<string, unknown>).balance)) && Array.isArray(profile.creditCards) && profile.creditCards.every((item) => named(item) && money((item as Record<string, unknown>).limit) && money((item as Record<string, unknown>).owed)) && Array.isArray(profile.categoryBudgets) && profile.categoryBudgets.every(named) && Array.isArray(profile.savingsGoals) && profile.savingsGoals.every(named) && !!profile.onboarding && typeof profile.createdAt === "string" && typeof profile.updatedAt === "string";
}

export function migrateLegacyProfile(value: unknown): Record<string, unknown> | null { if (!value || typeof value !== "object" || (value as Record<string, unknown>).version !== 1) return null; const migrated = { ...(value as Record<string, unknown>), version: 2, transactions: [] }; return isFinancialProfile(migrated) ? migrated : null; }
export function resetFinancialStorage(storage: { removeItem: (key: string) => void }) { storage.removeItem(FINANCIAL_STORAGE_KEY); storage.removeItem(LEGACY_FINANCIAL_STORAGE_KEY); }
