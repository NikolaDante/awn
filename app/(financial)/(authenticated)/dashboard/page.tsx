import { PageHeader } from "@/components/application-ui";
import { DashboardView } from "@/components/finance-app-views";
import { AddTransactionButton } from "@/components/transactions-ui";

export default function DashboardPage() {
  return <div className="app-page dashboard-page"><PageHeader title="Dashboard" eyebrow="Your financial overview"><AddTransactionButton /></PageHeader><DashboardView /></div>;
}
