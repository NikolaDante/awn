import { PageHeader } from "@/components/application-ui";
import { InsightsView } from "@/components/finance-app-views";

export default function InsightsPage() {
  return <div className="app-page insights-page"><PageHeader title="Insights" eyebrow="Smarter money signals" /><p className="insights-page-intro">Simple patterns and alerts from your spending, budgets, and goals.</p><InsightsView /></div>;
}
