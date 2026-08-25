import { DEFAULT_CATEGORY_NAMES, isDefaultCategoryName } from "./financial-categories.ts";
import type { Currency, FinancialProfile } from "./financial-types.ts";

export const currencyNames: Record<Currency, string> = {
  AED: "UAE Dirham", USD: "US Dollar", EUR: "Euro", GBP: "British Pound", SAR: "Saudi Riyal", RSD: "Serbian Dinar",
};

export function validPlanName(value: string) {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 60 ? trimmed : null;
}

export function hasMeaningfulFinancialData(profile: FinancialProfile) {
  return Boolean(
    profile.incomeSources.length || profile.accounts.length || (profile.debitCards?.length ?? 0) || profile.creditCards.length
    || profile.transactions.length || profile.categoryBudgets.length || profile.savingsGoals.length || (profile.customCategories?.length ?? 0)
    || (profile.cashBalance ?? 0) || profile.monthlyBudget || (profile.monthlyBudgets?.length ?? 0),
  );
}

export function customCategoryRemoval(profile: FinancialProfile, category: string) {
  if (isDefaultCategoryName(category)) return { allowed: false, reason: "AWN default categories can’t be removed." };
  const used = profile.transactions.some((transaction) => transaction.type === "expense" && transaction.category === category)
    || profile.categoryBudgets.some((budget) => budget.name === category);
  return used ? { allowed: false, reason: "This category is already used in your financial history and can’t be removed." } : { allowed: true, reason: null };
}

export function addCustomCategory(profile: FinancialProfile, value: string) {
  const name = value.trim();
  if (!name || name.length > 60) return { profile, error: "Enter a category name up to 60 characters." };
  const known = [...DEFAULT_CATEGORY_NAMES, ...(profile.customCategories ?? [])];
  if (known.some((item) => item.toLowerCase() === name.toLowerCase())) return { profile, error: "That category already exists." };
  return { profile: { ...profile, customCategories: [...(profile.customCategories ?? []), name] }, error: null };
}

export function buildFinancialExport(householdName: string, profile: FinancialProfile, exportedAt = new Date().toISOString()) {
  return {
    exportVersion: 1,
    exportedAt,
    plan: { name: householdName, country: profile.country, baseCurrency: profile.currency, budgetStartDay: profile.budgetStartDay, usualMonthlyIncome: profile.usualMonthlyIncome, monthlySavingsGuidance: profile.monthlySavingsGuidance },
    financialData: {
      incomeSources: profile.incomeSources,
      cashBalance: profile.cashBalance ?? 0,
      accounts: profile.accounts,
      debitCards: profile.debitCards ?? [],
      creditCards: profile.creditCards,
      transactions: profile.transactions,
      monthlyBudget: profile.monthlyBudget,
      monthlyBudgets: profile.monthlyBudgets ?? [],
      categoryBudgets: profile.categoryBudgets,
      savingsGoals: profile.savingsGoals,
      customCategories: profile.customCategories ?? [],
    },
  };
}

export function clearConfirmationReady(value: string) { return value === "CLEAR"; }
