import { AppShell } from "@/components/app-shell";
import { ComingSoonButton, PageHeader } from "@/components/application-ui";
import { AddTransactionButton, TransactionsView } from "@/components/transactions-ui";

export default function TransactionsPage() {
  return <AppShell><div className="app-page"><PageHeader title="Transactions" eyebrow="Your activity, in one place"><AddTransactionButton /><ComingSoonButton secondary>Import bank SMS</ComingSoonButton></PageHeader><TransactionsView /></div></AppShell>;
}
