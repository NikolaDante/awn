import { PageHeader } from "@/components/application-ui";
import { PlanView } from "@/components/finance-app-views";
import { readPlanViewState } from "@/lib/financial-navigation";

type PlanSearchParams = Promise<{ tab?: string | string[]; action?: string | string[] }>;

export default async function PlanPage({ searchParams }: { searchParams: PlanSearchParams }) {
  const view = readPlanViewState(await searchParams);
  return <div className="app-page plan-page"><PageHeader title="Plan" eyebrow="Budgets and goals" /><PlanView initialTab={view.tab} initialAction={view.action} /></div>;
}
