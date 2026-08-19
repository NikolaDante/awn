import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/application-ui";
import { AddTransactionButton, TransactionsView } from "@/components/transactions-ui";

export default function TransactionsPage() {
  return <AppShell><div className="app-page transactions-page"><PageHeader title="Transactions" eyebrow="This month"><button type="button" className="app-button app-button-secondary" disabled>Import bank SMS</button><AddTransactionButton /></PageHeader><TransactionsView /></div></AppShell>;
}
