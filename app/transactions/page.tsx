import { AppShell } from "@/components/app-shell";
import { ComingSoonButton, EmptyState, PageHeader, SectionCard } from "@/components/application-ui";

export default function TransactionsPage() {
  return <AppShell><div className="app-page"><PageHeader title="Transactions" eyebrow="Your activity, in one place"><ComingSoonButton>Add transaction</ComingSoonButton><ComingSoonButton secondary>Import bank SMS</ComingSoonButton></PageHeader><div className="filter-row"><p>When activity is available, you&apos;ll be able to review it here by month and category.</p><button className="filter-button" type="button" disabled>Filters <span className="coming-soon">Coming soon</span></button></div><SectionCard className="transactions-empty"><EmptyState title="No transactions yet">Add activity manually or import supported bank SMS when these tools become available. AWN will use that activity to help shape your monthly plan.</EmptyState></SectionCard></div></AppShell>;
}
