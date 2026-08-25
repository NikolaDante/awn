import { createClient } from "@/lib/supabase/client";
import { parseSharedBudget, parseSharedPlan, parseSharedSavingsGoals, type SharedPlan, type SharedSavingsGoal } from "@/lib/shared-planning";
import type { Currency } from "@/lib/financial-types";

async function rpc(name: string, parameters: Record<string, unknown> = {}) {
  const { data, error } = await createClient().rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data;
}

export async function getSharedPlan() {
  const plan = parseSharedPlan(await rpc("awn_get_shared_plan"));
  if (!plan) throw new Error("invalid_shared_plan");
  return plan;
}

export async function updateSharedPlanSettings(plan: SharedPlan, values: { name: string; currency: Currency; budgetStartDay: number }) {
  await rpc("awn_update_shared_plan_settings", { p_household_id: plan.householdId, p_name: values.name, p_currency: values.currency, p_budget_start_day: values.budgetStartDay });
}

export async function getSharedBudget(plan: SharedPlan, periodKey: string) {
  return parseSharedBudget(await rpc("awn_get_shared_budget_responsibilities", { p_household_id: plan.householdId, p_period_key: periodKey }), periodKey);
}

export type SharedBudgetSaveAllocation = { category: string; amount: number; members: Array<{ userId: string; amount: number }> };
export async function saveSharedBudget(plan: SharedPlan, periodKey: string, overallBudget: number, allocations: SharedBudgetSaveAllocation[], defaultSplit: { mode: "equal" | "custom"; primaryUserId: string; primaryPercent: number }) {
  await rpc("awn_save_shared_budget", { p_household_id: plan.householdId, p_period_key: periodKey,
    p_overall_budget_minor: overallBudget, p_allocations: allocations, p_default_split_mode: defaultSplit.mode,
    p_default_primary_user_id: defaultSplit.primaryUserId, p_default_primary_percent: defaultSplit.primaryPercent });
}

export async function getSharedSavingsGoals(plan: SharedPlan) {
  return parseSharedSavingsGoals(await rpc("awn_get_shared_savings_goals", { p_household_id: plan.householdId }));
}

export async function saveSharedSavingsGoal(plan: SharedPlan, goal: Pick<SharedSavingsGoal, "name" | "target" | "contribution" | "targetDate" | "priority"> & { id?: string }) {
  await rpc("awn_save_shared_savings_goal", { p_household_id: plan.householdId, p_goal_id: goal.id ?? null,
    p_name: goal.name, p_target_minor: goal.target, p_planned_contribution_minor: goal.contribution,
    p_target_date: goal.targetDate ?? null, p_priority: goal.priority });
}

export async function deleteSharedSavingsGoal(plan: SharedPlan, goalId: string) {
  await rpc("awn_delete_shared_savings_goal", { p_household_id: plan.householdId, p_goal_id: goalId });
}

export async function addSharedSavingsContribution(plan: SharedPlan, goalId: string, amount: number) {
  await rpc("awn_add_shared_savings_contribution", { p_household_id: plan.householdId, p_goal_id: goalId, p_amount_minor: amount });
}
