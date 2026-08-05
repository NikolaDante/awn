import { AppShell } from "@/components/app-shell";
import { PageHeader, SetupCard } from "@/components/application-ui";

export default function PlanPage() {
  return <AppShell><div className="app-page"><PageHeader title="Plan" eyebrow="Make room for what matters" /><p className="intro-copy">Your plan brings this month&apos;s budget, a savings goal, and upcoming commitments into one quieter picture.</p><div className="app-card-grid"><SetupCard eyebrow="Monthly budget" title="Shape your month">Set a budget to separate regular commitments from flexible spending.</SetupCard><SetupCard eyebrow="Savings goal" title="Choose a direction">Add a goal when you&apos;re ready to set aside money with purpose.</SetupCard></div><SetupCard eyebrow="Upcoming commitments" title="See what is already spoken for">Future bills and planned commitments will appear here once your accounts and monthly budget are set up.</SetupCard></div></AppShell>;
}
