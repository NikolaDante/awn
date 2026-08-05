import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ComingSoonButton, EmptyState, PageHeader, PlaceholderValue, SetupCard } from "@/components/application-ui";

export default function DashboardPage() {
  return <AppShell><div className="app-page">
    <PageHeader title="Dashboard" eyebrow="Your monthly picture"><ComingSoonButton>Add transaction</ComingSoonButton><ComingSoonButton secondary>Import bank SMS</ComingSoonButton></PageHeader>
    <section className="monthly-position"><div><p className="app-eyebrow">Monthly position</p><h2>A clearer view begins with your setup.</h2><p>AWN will bring together money left, safe to spend, and upcoming commitments when your starting plan is ready.</p><Link className="app-button app-button-light" href="/onboarding">Set up your starting plan <span aria-hidden="true">↗</span></Link></div><div className="position-values"><PlaceholderValue label="Money left">—</PlaceholderValue><PlaceholderValue label="Safe to spend">—</PlaceholderValue><PlaceholderValue label="Upcoming commitments">—</PlaceholderValue></div></section>
    <div className="app-card-grid"><SetupCard eyebrow="Monthly plan" title="Make a plan for this month">Set a budget to understand what is committed, flexible, and available for the things you care about.</SetupCard><SetupCard eyebrow="Savings goal" title="Give a future goal some room">Choose one goal and AWN will help you keep it in view alongside this month.</SetupCard></div>
    <div className="app-card-grid"><EmptyState title="Accounts & Cards" href="/accounts" action="Explore accounts">Your accounts and credit cards will appear here once you add them.</EmptyState><EmptyState title="Recent activity" href="/transactions" action="View transactions">There is no activity to review yet. Manual entry and SMS import will live here.</EmptyState></div>
  </div></AppShell>;
}
