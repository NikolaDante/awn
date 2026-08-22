import type { CategoryBudget, FinancialProfile } from "@/lib/financial-types";
import { budgetPeriodForDate } from "./financial-date.ts";

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

export function overallBudgetForMonth(profile: FinancialProfile, month: string) {
  const snapshot = profile.monthlyBudgets?.find((budget) => budget.month === month);
  if (snapshot?.limit && snapshot.limit > 0) return snapshot.limit;
  return profile.monthlyBudget && profile.monthlyBudget > 0 ? profile.monthlyBudget : undefined;
}

export function hasOverallBudget(profile: FinancialProfile, month: string) {
  return overallBudgetForMonth(profile, month) !== undefined;
}

export function replaceOverallBudgetSnapshot(profile: FinancialProfile, month: string, limit: number): FinancialProfile {
  const retained = (profile.monthlyBudgets ?? []).filter((budget) => budget.month !== month);
  const monthlyBudgets = limit > 0 ? [...retained, { month, limit }] : retained;
  return { ...profile, monthlyBudget: limit > 0 ? limit : undefined, monthlyBudgets };
}

export function normalizeBudgetSnapshots(profile: FinancialProfile, activeMonth: string): FinancialProfile {
  const unscoped = profile.categoryBudgets.filter((category) => category.month === undefined);
  const activeNames = new Set(profile.categoryBudgets.filter((category) => category.month === activeMonth).map((category) => category.name.toLowerCase()));
  const migrated = unscoped.filter((category) => !activeNames.has(category.name.toLowerCase())).map((category) => ({ ...category, month: activeMonth }));
  const categoryBudgets = unscoped.length ? [...profile.categoryBudgets.filter((category) => category.month !== undefined), ...migrated] : profile.categoryBudgets;
  const knownMonths = new Set([activeMonth, ...categoryBudgets.flatMap((category) => category.month ? [category.month] : []), ...profile.transactions.map((transaction) => budgetPeriodForDate(profile.budgetStartDay, transaction.date).key)]);
  const monthlyBudgets = [...(profile.monthlyBudgets ?? [])];
  if (profile.monthlyBudget && profile.monthlyBudget > 0) {
    for (const month of knownMonths) if (!monthlyBudgets.some((budget) => budget.month === month)) monthlyBudgets.push({ month, limit: profile.monthlyBudget });
  }
  if (categoryBudgets === profile.categoryBudgets && monthlyBudgets.length === (profile.monthlyBudgets ?? []).length) return profile;
  return { ...profile, categoryBudgets, monthlyBudgets };
}

export function replaceBudgetSnapshot(profile: FinancialProfile, month: string, categories: CategoryBudget[]): FinancialProfile {
  const normalized = normalizeBudgetSnapshots(profile, month);
  const retained = normalized.categoryBudgets.filter((category) => category.month !== month);
  const snapshot = categories.map((category) => ({ ...category, month }));
  return { ...normalized, categoryBudgets: [...retained, ...snapshot] };
}

export function budgetDraftAllocation(overall: number, categories: CategoryBudget[]) {
  const allocated = categories.reduce((total, category) => total + category.limit, 0);
  return { overall, allocated, unallocated: overall - allocated };
}

export function replaceManagedBudgetSnapshot(profile: FinancialProfile, month: string, overall: number, categories: CategoryBudget[]) {
  const normalized = normalizeBudgetSnapshots(profile, month);
  return replaceBudgetSnapshot(replaceOverallBudgetSnapshot(normalized, month, overall), month, categories);
}

export type BudgetSummary = {
  budget: number | null;
  allocated: number;
  unallocated: number | null;
  spent: number;
  remaining: number | null;
  percent: number | null;
  kind: "none" | "under" | "near" | "exact" | "over";
  tone: "neutral" | "good" | "watch" | "over";
  statusLabel: "No budget" | "Under budget" | "Near limit" | "On budget" | "Over budget";
};

export function budgetSummary(profile: FinancialProfile, month: string, spent: number): BudgetSummary {
  const budget = overallBudgetForMonth(profile, month) ?? null;
  const allocated = budgetCategoriesForMonth(profile, month).reduce((total, category) => total + category.limit, 0);
  if (budget === null) return { budget, allocated, unallocated: null, spent, remaining: null, percent: null, kind: "none", tone: "neutral", statusLabel: "No budget" };
  const remaining = budget - spent;
  const percent = spent / budget * 100;
  if (remaining < 0) return { budget, allocated, unallocated: budget - allocated, spent, remaining, percent, kind: "over", tone: "over", statusLabel: "Over budget" };
  if (remaining === 0) return { budget, allocated, unallocated: budget - allocated, spent, remaining, percent, kind: "exact", tone: "watch", statusLabel: "On budget" };
  if (percent >= 85) return { budget, allocated, unallocated: budget - allocated, spent, remaining, percent, kind: "near", tone: "watch", statusLabel: "Near limit" };
  return { budget, allocated, unallocated: budget - allocated, spent, remaining, percent, kind: "under", tone: "good", statusLabel: "Under budget" };
}

export function dashboardBudgetHeroState(summary: BudgetSummary) {
  if (summary.kind === "none" || summary.remaining === null) return { label: "Monthly budget", amount: null, valueLabel: "No budget", statusLabel: null };
  return {
    label: summary.remaining < 0 ? "Over budget" : "Budget remaining",
    amount: Math.abs(summary.remaining),
    valueLabel: null,
    statusLabel: summary.statusLabel,
  };
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
