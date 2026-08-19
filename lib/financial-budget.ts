import type { CategoryBudget, FinancialProfile } from "@/lib/financial-types";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isBudgetMonth(value: unknown): value is string {
  return typeof value === "string" && monthPattern.test(value);
}

export function budgetCategoriesForMonth(profile: FinancialProfile, month: string) {
  const snapshot = profile.categoryBudgets.filter((category) => category.month === month);
  if (snapshot.length) return snapshot;
  return profile.categoryBudgets.filter((category) => category.month === undefined);
}

export function hasBudgetSnapshot(profile: FinancialProfile, month: string) {
  return profile.categoryBudgets.some((category) => category.month === month) || profile.categoryBudgets.some((category) => category.month === undefined);
}

export function normalizeBudgetSnapshots(profile: FinancialProfile, activeMonth: string): FinancialProfile {
  const unscoped = profile.categoryBudgets.filter((category) => category.month === undefined);
  if (!unscoped.length) return profile;
  const activeNames = new Set(profile.categoryBudgets.filter((category) => category.month === activeMonth).map((category) => category.name.toLowerCase()));
  const migrated = unscoped.filter((category) => !activeNames.has(category.name.toLowerCase())).map((category) => ({ ...category, month: activeMonth }));
  return { ...profile, categoryBudgets: [...profile.categoryBudgets.filter((category) => category.month !== undefined), ...migrated] };
}

export function replaceBudgetSnapshot(profile: FinancialProfile, month: string, categories: CategoryBudget[]): FinancialProfile {
  const normalized = normalizeBudgetSnapshots(profile, month);
  const retained = normalized.categoryBudgets.filter((category) => category.month !== month);
  const snapshot = categories.map((category) => ({ ...category, month }));
  return { ...normalized, categoryBudgets: [...retained, ...snapshot] };
}

export type CategoryBudgetPosition = {
  kind: "no-budget" | "unbudgeted" | "under" | "near" | "exact" | "over";
  tone: "neutral" | "good" | "watch" | "over";
  statusLabel: string;
  differenceLabel: "Remaining" | "Over";
  difference: number;
  percent: number | null;
};

export function categoryBudgetPosition(limit: number, spent: number): CategoryBudgetPosition {
  if (limit <= 0) {
    return spent > 0
      ? { kind: "unbudgeted", tone: "over", statusLabel: "Unbudgeted spend", differenceLabel: "Over", difference: spent, percent: null }
      : { kind: "no-budget", tone: "neutral", statusLabel: "No budget", differenceLabel: "Remaining", difference: 0, percent: null };
  }
  const difference = limit - spent;
  const percent = spent / limit * 100;
  if (difference < 0) return { kind: "over", tone: "over", statusLabel: "Over budget", differenceLabel: "Over", difference: Math.abs(difference), percent };
  if (difference === 0) return { kind: "exact", tone: "watch", statusLabel: "At budget", differenceLabel: "Remaining", difference: 0, percent };
  if (percent >= 85) return { kind: "near", tone: "watch", statusLabel: "Near limit", differenceLabel: "Remaining", difference, percent };
  return { kind: "under", tone: "good", statusLabel: "Under budget", differenceLabel: "Remaining", difference, percent };
}

export type MonthlyBudgetPosition = {
  kind: "unknown" | "under" | "exact" | "over";
  metricLabel: "Budget" | "Budget Remaining" | "Over Budget";
  statusLabel: "No budget history" | "Under budget" | "On budget" | "Over budget";
  tone: "neutral" | "good" | "over";
  difference: number | null;
};

export function monthlyBudgetPosition(budget: number | null, spent: number): MonthlyBudgetPosition {
  if (budget === null) return { kind: "unknown", metricLabel: "Budget", statusLabel: "No budget history", tone: "neutral", difference: null };
  const difference = budget - spent;
  if (difference < 0) return { kind: "over", metricLabel: "Over Budget", statusLabel: "Over budget", tone: "over", difference: Math.abs(difference) };
  if (difference === 0) return { kind: "exact", metricLabel: "Budget Remaining", statusLabel: "On budget", tone: "good", difference: 0 };
  return { kind: "under", metricLabel: "Budget Remaining", statusLabel: "Under budget", tone: "good", difference };
}
