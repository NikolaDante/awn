import { PageHeader } from "@/components/application-ui";
import { AddTransactionButton, TransactionsView } from "@/components/transactions-ui";

export default function TransactionsPage() {
  return <div className="app-page transactions-page"><PageHeader title="Transactions" eyebrow="Current budget period"><button type="button" className="app-button app-button-secondary" disabled>Import bank SMS</button><AddTransactionButton /></PageHeader><TransactionsView /></div>;
}
