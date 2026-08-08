import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/application-ui";
import { PlanView } from "@/components/financial-views";

export default function PlanPage() {
  return <AppShell><div className="app-page"><PageHeader title="Plan" eyebrow="Make room for what matters" /><p className="intro-copy">Your plan brings this month&apos;s budget, savings goals, and future commitments into one quieter picture.</p><PlanView /></div></AppShell>;
}
