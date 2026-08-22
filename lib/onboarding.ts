import { budgetCategoriesForMonth, overallBudgetForMonth } from "./financial-budget.ts";
import { financialReferenceMonth } from "./financial-date.ts";
import type { CategoryBudget, FinancialProfile, SavingsGoal } from "./financial-types.ts";

export const onboardingSteps = ["Basics", "Accounts", "How AWN works", "Budget", "Savings", "Review"] as const;
export const onboardingStepParams = ["basics", "accounts", "how-it-works", "budget", "savings", "review"] as const;

const legacyStepParams: Record<string, number> = { income: 1, accounts: 2, budget: 4, savings: 5, review: 6 };

export function requestedOnboardingStep(value: string | null, storedStep: number) {
  if (value && legacyStepParams[value]) return legacyStepParams[value];
  const index = onboardingStepParams.indexOf(value as (typeof onboardingStepParams)[number]);
  if (index >= 0) return index + 1;
  return Number.isInteger(storedStep) && storedStep >= 0 && storedStep <= 6 ? storedStep : 0;
}

export function authenticatedFinancialRoute(profile: FinancialProfile | null, pathname: string) {
  if (pathname === "/onboarding") return null;
  return !profile?.onboarding.completed ? "/onboarding" : null;
}

export function effectiveMonthlyBudget(profile: FinancialProfile, month = financialReferenceMonth(profile)) {
  return overallBudgetForMonth(profile, month);
}

export function budgetAllocation(profile: FinancialProfile, month = financialReferenceMonth(profile)) {
  const categories = budgetCategoriesForMonth(profile, month);
  const total = effectiveMonthlyBudget(profile, month) ?? 0;
  const allocated = categories.reduce((sum, category) => sum + category.limit, 0);
  return { total, allocated, unallocated: total - allocated, categories };
}

export function normalizeSavingsTargetMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `${month}-01` : undefined;
}

export function savingsTargetMonth(goal: Pick<SavingsGoal, "targetDate">) {
  return goal.targetDate?.slice(0, 7) ?? "";
}

export function formatTargetMonth(targetDate?: string) {
  if (!targetDate) return "No target month";
  const month = targetDate.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return "No target month";
  return new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function normalizeBudgetStartDayInput(value: string) {
  if (!/^\d*$/.test(value)) return null;
  return value.replace(/^0+(?=\d)/, "").replace(/^0$/, "");
}

export function parseBudgetStartDayInput(value: string) {
  if (!/^(?:[1-9]|1\d|2[0-8])$/.test(value)) return undefined;
  return Number(value);
}

export function budgetCycle(startDay: number, reference = new Date()) {
  const day = Math.max(1, Math.min(28, Math.trunc(startDay || 1)));
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const start = today.getDate() >= day ? new Date(today.getFullYear(), today.getMonth(), day) : new Date(today.getFullYear(), today.getMonth() - 1, day);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, day - 1);
  return { start, end };
}

export function formatBudgetCycle(startDay: number, reference = new Date()) {
  const { start, end } = budgetCycle(startDay, reference);
  const format = (date: Date) => date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: start.getFullYear() === end.getFullYear() ? undefined : "numeric" });
  return `${format(start)} – ${format(end)}`;
}

export function upsertOnboardingItem<T extends { id: string }>(items: T[], item: T) {
  return items.some((current) => current.id === item.id) ? items.map((current) => current.id === item.id ? item : current) : [...items, item];
}

export function removeOnboardingItem<T extends { id: string }>(items: T[], id: string) {
  return items.filter((item) => item.id !== id);
}

export function categoryBudgetValid(category: Pick<CategoryBudget, "name" | "limit">) {
  return Boolean(category.name.trim()) && category.limit > 0;
}
