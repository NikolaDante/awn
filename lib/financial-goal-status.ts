import type { FinancialProfile, SavingsGoal } from "@/lib/financial-types";

export type SavingsGoalStatus = {
  kind: "ahead" | "on-track" | "behind" | "almost-there" | "completed" | "in-progress";
  label: "Ahead" | "On track" | "Behind" | "Almost there" | "Completed" | "In progress";
  tone: "good" | "watch" | "neutral";
  actualPercent: number;
  expectedPercent: number | null;
};

const dateValue = (value: string | undefined) => value && /^\d{4}-\d{2}-\d{2}/.test(value) ? Date.parse(`${value.slice(0, 10)}T12:00:00Z`) : Number.NaN;

export function savingsGoalStatus(goal: SavingsGoal, referenceDate: string, fallbackStartDate?: string): SavingsGoalStatus {
  const actualPercent = goal.target > 0 ? goal.saved / goal.target * 100 : 0;
  if (actualPercent >= 100) return { kind: "completed", label: "Completed", tone: "good", actualPercent, expectedPercent: 100 };
  if (actualPercent >= 90) return { kind: "almost-there", label: "Almost there", tone: "neutral", actualPercent, expectedPercent: null };
  if (!goal.targetDate) return { kind: "in-progress", label: "In progress", tone: "neutral", actualPercent, expectedPercent: null };

  const start = dateValue(goal.startDate ?? fallbackStartDate);
  const target = dateValue(goal.targetDate);
  const reference = dateValue(referenceDate);
  if (!Number.isFinite(start) || !Number.isFinite(target) || !Number.isFinite(reference) || target <= start) {
    return { kind: "in-progress", label: "In progress", tone: "neutral", actualPercent, expectedPercent: null };
  }

  const expectedPercent = Math.max(0, Math.min(100, (reference - start) / (target - start) * 100));
  if (actualPercent >= expectedPercent + 10) return { kind: "ahead", label: "Ahead", tone: "good", actualPercent, expectedPercent };
  if (actualPercent < expectedPercent - 10) return { kind: "behind", label: "Behind", tone: "watch", actualPercent, expectedPercent };
  return { kind: "on-track", label: "On track", tone: "good", actualPercent, expectedPercent };
}

export function profileSavingsGoalStatus(profile: FinancialProfile, goal: SavingsGoal, referenceDate: string) {
  return savingsGoalStatus(goal, referenceDate, profile.createdAt.slice(0, 10));
}
