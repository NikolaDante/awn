import type { FinancialProfile, SavingsGoal } from "@/lib/financial-types";

export function upsertSavingsGoal(profile: FinancialProfile, goal: SavingsGoal): FinancialProfile {
  const savingsGoals = profile.savingsGoals.some((item) => item.id === goal.id)
    ? profile.savingsGoals.map((item) => item.id === goal.id ? goal : item)
    : [...profile.savingsGoals, goal];
  return { ...profile, savingsGoals };
}

export function deleteSavingsGoal(profile: FinancialProfile, id: string): FinancialProfile {
  return { ...profile, savingsGoals: profile.savingsGoals.filter((goal) => goal.id !== id) };
}

export function savingsGoalTotals(profile: FinancialProfile) {
  return profile.savingsGoals.reduce((totals, goal) => ({ saved: totals.saved + goal.saved, target: totals.target + goal.target }), { saved: 0, target: 0 });
}
