import { PageHeader } from "@/components/application-ui";
import { ImportBankSmsButton } from "@/components/bank-sms-import";
import { DashboardView } from "@/components/finance-app-views";
import { AddTransactionButton } from "@/components/transactions-ui";

export default function DashboardPage() {
  return <div className="app-page dashboard-page"><PageHeader title="Dashboard" eyebrow="Your financial overview"><ImportBankSmsButton /><AddTransactionButton /></PageHeader><DashboardView /></div>;
}
