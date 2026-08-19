export type PlanTab = "budgets" | "savings";
export type PlanAction = "edit-budget" | "add-goal";

export function readPlanViewState(params: { tab?: string | string[]; action?: string | string[] }) {
  const tab: PlanTab = params.tab === "savings" ? "savings" : "budgets";
  const action: PlanAction | undefined = params.action === "edit-budget" || params.action === "add-goal" ? params.action : undefined;
  return { tab, action };
}
