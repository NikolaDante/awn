import type { Currency } from "@/lib/financial-types";

export type SharedPlan = {
  householdId: string;
  name: string;
  role: "owner" | "member";
  memberCount: number;
  currency: Currency;
  budgetStartDay: number;
  revision: number;
  updatedAt: string;
};

export type SharedBudgetCategory = { category: string; allocated: number; spent: number };
export type SharedBudgetSummary = {
  periodKey: string;
  overallBudget: number | null;
  totalSpent: number;
  categories: SharedBudgetCategory[];
  updatedBy: string | null;
  updatedAt: string | null;
};

export type SharedSavingsGoal = {
  id: string;
  name: string;
  target: number;
  saved: number;
  contribution: number;
  targetDate?: string;
  priority: number;
  updatedBy: string;
  updatedAt: string;
  latestContribution?: { amount: number; addedBy: string; createdAt: string };
};

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : value && typeof value === "object" ? [value as Row] : [];
const integer = (value: unknown) => Number.isSafeInteger(value) ? Number(value) : null;

export function parseSharedPlan(value: unknown): SharedPlan | null {
  const row = rows(value)[0];
  const memberCount = integer(row?.member_count); const budgetStartDay = integer(row?.budget_start_day); const revision = integer(row?.revision);
  if (!row || typeof row.household_id !== "string" || typeof row.shared_plan_name !== "string"
    || (row.member_role !== "owner" && row.member_role !== "member") || memberCount === null
    || !["AED", "USD", "EUR", "GBP", "SAR", "RSD"].includes(String(row.currency))
    || budgetStartDay === null || revision === null || typeof row.updated_at !== "string") return null;
  return { householdId: row.household_id, name: row.shared_plan_name, role: row.member_role,
    memberCount, currency: row.currency as Currency, budgetStartDay, revision, updatedAt: row.updated_at };
}

export function parseSharedBudget(value: unknown, periodKey: string): SharedBudgetSummary {
  const parsed = rows(value); const first = parsed[0];
  const overall = integer(first?.overall_budget_minor); const totalSpent = integer(first?.total_spent_minor) ?? 0;
  return {
    periodKey,
    overallBudget: overall && overall > 0 ? overall : null,
    totalSpent,
    categories: parsed.flatMap((row) => typeof row.category === "string" ? [{
      category: row.category,
      allocated: integer(row.allocated_minor) ?? 0,
      spent: integer(row.spent_minor) ?? 0,
    }] : []),
    updatedBy: typeof first?.updated_by_name === "string" ? first.updated_by_name : null,
    updatedAt: typeof first?.updated_at === "string" ? first.updated_at : null,
  };
}

export function parseSharedSavingsGoals(value: unknown): SharedSavingsGoal[] {
  return rows(value).flatMap((row) => {
    const target = integer(row.target_minor); const saved = integer(row.saved_minor); const contribution = integer(row.planned_contribution_minor); const priority = integer(row.priority);
    if (typeof row.goal_id !== "string" || typeof row.name !== "string" || target === null || saved === null
      || contribution === null || priority === null || typeof row.updated_by_name !== "string" || typeof row.updated_at !== "string") return [];
    const latestAmount = integer(row.latest_contribution_minor);
    return [{ id: row.goal_id, name: row.name, target, saved, contribution,
      targetDate: typeof row.target_date === "string" ? row.target_date : undefined, priority,
      updatedBy: row.updated_by_name, updatedAt: row.updated_at,
      latestContribution: latestAmount && typeof row.latest_contribution_by === "string" && typeof row.latest_contribution_at === "string"
        ? { amount: latestAmount, addedBy: row.latest_contribution_by, createdAt: row.latest_contribution_at } : undefined }];
  });
}
